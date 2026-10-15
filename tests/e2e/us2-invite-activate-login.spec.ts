// T103 / US2 scenarios 1-28. Runs against the portal (project `portal-tenant-a`) on tenant hosts, the Development
// Supabase project and a mail catcher (Mailpit-compatible API at MAIL_CATCHER_URL).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";
import { clearMail, extractLink, waitForMail } from "../helpers/mail";

const base = process.env.PORTAL_BASE_DOMAIN ?? "portal.localhost:3000";
const scheme = "http";
const host = (sub: string) => `${scheme}://${sub}.${base}`;
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives both tenant hosts");
});
test.describe.configure({ mode: "serial" });

let fx: TwoTenantFixture;
const t = en.portal;
const NEW_PASSWORD = "Activate-Pass-1";
const RESET_PASSWORD = "Recovered-Pass-2";
const MANAGER_RESET_PASSWORD = "Assisted-Pass-3";
const tag = Math.random().toString(36).slice(2, 8);
const inviteA = `invitee-a-${tag}@e2e.example.test`;
const inviteB = `invitee-b-${tag}@e2e.example.test`;
let staffAId = "";
let lastLink = "";

test.beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
test.afterAll(async () => {
  if (!fx) return;
  // accounts activated through the UI belong to the fixture tenants: remove their Auth users with the rest
  const created = await sql<{ id: string }>(`select auth_user_id id from public.tenant_staff where tenant_id in ('${fx.tenantA.id}','${fx.tenantB.id}')`);
  for (const r of created) fx.trackUser(r.id);
  await fx.teardown();
});

async function newPage(browser: Browser, sub: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "locale", value: "en", url: host(sub) }]); // the default locale is Arabic
  return context.newPage();
}
async function signIn(page: Page, sub: string, identifier: string, password: string) {
  await page.goto(`${host(sub)}/login`);
  await page.getByLabel(t.auth.identifier).fill(identifier);
  await page.getByLabel(t.auth.password).fill(password);
  await page.getByRole("button", { name: t.auth.signIn }).click();
}
const signOut = async (page: Page) => {
  await page.getByRole("button", { name: t.nav.signOut }).click();
  await page.waitForURL("**/login");
};

async function invite(browser: Browser, sub: string, managerUsername: string, email: string) {
  const page = await newPage(browser, sub);
  await signIn(page, sub, managerUsername, PASSWORD);
  await page.waitForURL(`${host(sub)}/`);
  await page.goto(`${host(sub)}/settings/staff/invite`);
  await page.getByLabel(t.staff.email).fill(email);
  await page.getByLabel("Viewers").check();
  await page.getByRole("button", { name: t.staff.send }).click();
  await expect(page.getByText(t.staff.invited)).toBeVisible();
  // pending list: the new invitation, a Resend that is disabled during the cooldown (with the next time), and NO cancel control
  await page.goto(`${host(sub)}/settings/staff/invitations`);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole("button", { name: t.staff.resend })).toBeDisabled();
  await expect(page.getByText(t.staff.resendAvailableAt)).toBeVisible();
  await expect(page.getByRole("button", { name: /cancel|withdraw|delete/i })).toHaveCount(0);
  await page.context().close();
}

test("managers invite staff in tenants A and B", async ({ browser }) => {
  await clearMail();
  await invite(browser, fx.tenantA.subdomain, fx.managerA.username, inviteA);
  await invite(browser, fx.tenantB.subdomain, fx.managerB.username, inviteB);
  const pending = await sql(`select 1 from public.staff_invitations where recipient_email_normalized in ('${inviteA}','${inviteB}') and state = 'pending'`);
  expect(pending).toHaveLength(2);
});

test("invitee sees the username rules, gets inline errors and activates", async ({ browser }) => {
  const link = extractLink(await waitForMail(inviteA), "/invite/accept");
  expect(link.startsWith(host(fx.tenantA.subdomain))).toBe(true);
  const page = await newPage(browser, fx.tenantA.subdomain);
  await page.goto(link);
  await expect(page.getByText(en.username.hint)).toBeVisible();
  await expect(page.getByText(inviteA)).toBeVisible(); // email shown read-only
  await page.getByLabel(en.username.label).fill("ab");
  await expect(page.getByText(en.username.errorLength)).toBeVisible();
  await page.getByLabel(en.username.label).fill("ahmed1");
  await expect(page.getByText(en.username.errorCharset)).toBeVisible();
  await page.getByLabel(en.username.label).fill(".ahmed");
  await expect(page.getByText(en.username.errorPlacement)).toBeVisible();
  await page.getByLabel(en.username.label).fill("Ahmed");
  await page.getByLabel(t.invite.password, { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel(t.invite.confirmPassword).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: t.invite.activate }).click();
  await page.waitForURL(`${host(fx.tenantA.subdomain)}/`);
  await expect(page.getByText("Ahmed").first()).toBeVisible();
  const [row] = await sql<{ id: string }>(`select id from public.tenant_staff where email_normalized = '${inviteA}'`);
  staffAId = row!.id;
  // the same link cannot be used twice, and tenant B's host rejects it without disclosure
  const again = await newPage(browser, fx.tenantA.subdomain);
  await again.goto(link);
  await expect(again.getByText(t.invite.invalidBody)).toBeVisible();
  const foreign = await newPage(browser, fx.tenantB.subdomain);
  await foreign.goto(link.replace(fx.tenantA.subdomain, fx.tenantB.subdomain));
  await expect(foreign.getByText(t.invite.invalidBody)).toBeVisible();
});

test("signs in with Ahmed, AHMED and the email; tenant A's email fails generically on host B", async ({ browser }) => {
  for (const id of ["Ahmed", "AHMED", inviteA]) {
    const page = await newPage(browser, fx.tenantA.subdomain);
    await signIn(page, fx.tenantA.subdomain, id, NEW_PASSWORD);
    await page.waitForURL(`${host(fx.tenantA.subdomain)}/`);
    await page.context().close();
  }
  const wrongHost = await newPage(browser, fx.tenantB.subdomain);
  await signIn(wrongHost, fx.tenantB.subdomain, inviteA, NEW_PASSWORD);
  await expect(wrongHost.locator('p[role="alert"]')).toHaveText(t.auth.invalidCredentials);
  const unknown = await newPage(browser, fx.tenantB.subdomain);
  await signIn(unknown, fx.tenantB.subdomain, "no.such.user", NEW_PASSWORD);
  await expect(unknown.locator('p[role="alert"]')).toHaveText(t.auth.invalidCredentials); // identical message
});

test("changes the username without a password; the old name stops working", async ({ browser }) => {
  const page = await newPage(browser, fx.tenantA.subdomain);
  await signIn(page, fx.tenantA.subdomain, "Ahmed", NEW_PASSWORD);
  await page.waitForURL(`${host(fx.tenantA.subdomain)}/`);
  await page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await expect(page.getByLabel(/password/i)).toHaveCount(0); // no password field
  await expect(page.getByText(t.account.emailImmutable)).toBeVisible();
  await page.getByLabel(en.username.label).fill("Ahmed.Ali");
  await page.getByRole("button", { name: t.account.save }).click();
  await expect(page.getByText(t.account.saved)).toBeVisible();
  await page.goto(`${host(fx.tenantA.subdomain)}/`);
  await signOut(page);
  await signIn(page, fx.tenantA.subdomain, "ahmed.ali", NEW_PASSWORD);
  await page.waitForURL(`${host(fx.tenantA.subdomain)}/`);
  await page.context().close();
  const old = await newPage(browser, fx.tenantA.subdomain);
  await signIn(old, fx.tenantA.subdomain, "Ahmed", NEW_PASSWORD);
  await expect(old.locator('p[role="alert"]')).toHaveText(t.auth.invalidCredentials);
});

test("self-service recovery: neutral response, one-time link, new password works", async ({ browser }) => {
  await clearMail();
  const page = await newPage(browser, fx.tenantA.subdomain);
  await page.goto(`${host(fx.tenantA.subdomain)}/recover`);
  await page.getByLabel(t.recovery.identifier).fill("Ahmed.Ali");
  await page.getByRole("button", { name: t.recovery.send }).click();
  await expect(page.getByText(t.recovery.neutral)).toBeVisible();
  const unknown = await newPage(browser, fx.tenantA.subdomain);
  await unknown.goto(`${host(fx.tenantA.subdomain)}/recover`);
  await unknown.getByLabel(t.recovery.identifier).fill("nobody.here");
  await unknown.getByRole("button", { name: t.recovery.send }).click();
  await expect(unknown.getByText(t.recovery.neutral)).toBeVisible(); // identical for an unknown account
  lastLink = extractLink(await waitForMail(inviteA), "/recover/complete");
  const reset = await newPage(browser, fx.tenantA.subdomain);
  await reset.goto(lastLink);
  await reset.getByLabel(t.recovery.newPassword).fill("weak");
  await reset.getByLabel(t.recovery.confirmPassword).fill("weak");
  await reset.getByRole("button", { name: t.recovery.submit }).click();
  await expect(reset.getByText(t.errors.password_policy)).toBeVisible(); // a typo does not burn the link
  await reset.getByLabel(t.recovery.newPassword).fill(RESET_PASSWORD);
  await reset.getByLabel(t.recovery.confirmPassword).fill(RESET_PASSWORD);
  await reset.getByRole("button", { name: t.recovery.submit }).click();
  await expect(reset.getByText(t.recovery.done)).toBeVisible();
  const used = await newPage(browser, fx.tenantA.subdomain);
  await used.goto(lastLink);
  await expect(used.getByText(t.recovery.invalidBody)).toBeVisible(); // used link: neutral message
  const login = await newPage(browser, fx.tenantA.subdomain);
  await signIn(login, fx.tenantA.subdomain, "Ahmed.Ali", RESET_PASSWORD);
  await login.waitForURL(`${host(fx.tenantA.subdomain)}/`);
});

test("manager-assisted reset asks for the manager's own password; an expired link shows a neutral message", async ({ browser }) => {
  await sql(`update public.recovery_requests set issued_at = issued_at - interval '10 minutes', expires_at = expires_at - interval '10 minutes' where staff_id = '${staffAId}'`);
  await clearMail();
  const staffSession = await newPage(browser, fx.tenantA.subdomain);
  await signIn(staffSession, fx.tenantA.subdomain, "Ahmed.Ali", RESET_PASSWORD);
  await staffSession.waitForURL(`${host(fx.tenantA.subdomain)}/`);

  const manager = await newPage(browser, fx.tenantA.subdomain);
  await signIn(manager, fx.tenantA.subdomain, fx.managerA.username, PASSWORD);
  await manager.waitForURL(`${host(fx.tenantA.subdomain)}/`);
  await manager.goto(`${host(fx.tenantA.subdomain)}/settings/staff/${staffAId}`);
  await manager.getByRole("button", { name: t.staff.resetPassword }).click();
  await manager.getByLabel(t.staff.managerPassword).fill("Not-My-Password-1");
  await manager.getByRole("button", { name: t.staff.confirmReset }).click();
  await expect(manager.getByText(t.errors.confirmation_required)).toBeVisible();
  await manager.getByLabel(t.staff.managerPassword).fill(PASSWORD);
  await manager.getByRole("button", { name: t.staff.confirmReset }).click();
  await expect(manager.getByText(t.staff.resetSent)).toBeVisible();

  const link = extractLink(await waitForMail(inviteA), "/recover/complete");
  const employee = await newPage(browser, fx.tenantA.subdomain);
  await employee.goto(link);
  await employee.getByLabel(t.recovery.newPassword).fill(MANAGER_RESET_PASSWORD);
  await employee.getByLabel(t.recovery.confirmPassword).fill(MANAGER_RESET_PASSWORD);
  await employee.getByRole("button", { name: t.recovery.submit }).click();
  await expect(employee.getByText(t.recovery.done)).toBeVisible();
  // completion ended the employee's other sessions
  await staffSession.goto(`${host(fx.tenantA.subdomain)}/account`);
  await staffSession.waitForURL("**/login");

  // expired link (60 minutes)
  await sql(`update public.recovery_requests set issued_at = issued_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes' where staff_id = '${staffAId}'`);
  const expired = await newPage(browser, fx.tenantA.subdomain);
  await expired.goto(link);
  await expect(expired.getByText(t.recovery.invalidBody)).toBeVisible();
});
