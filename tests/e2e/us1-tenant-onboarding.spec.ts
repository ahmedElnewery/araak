// T078 / US1 scenarios 1-14. Runs against the admin app (project `admin`), Development Supabase and a mail catcher.
// Needs E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD for a bootstrapped admin holding all capabilities.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { ar } from "../../packages/i18n/src/dictionaries/ar";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { adminClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { extractLink, waitForMail } from "../helpers/mail";

const adminUrl = process.env.E2E_ADMIN_URL ?? "http://admin.localhost:3001";
test.beforeEach(async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== "admin", "admin project only");
  await context.addCookies([{ name: "locale", value: "en", domain: new URL(adminUrl).hostname, path: "/" }]); // the default locale is Arabic
});
test.describe.configure({ mode: "serial" });

const adminEmail = process.env.E2E_PLATFORM_ADMIN_EMAIL ?? "";
const adminPassword = process.env.E2E_PLATFORM_ADMIN_PASSWORD ?? "";
const tag = randomUUID().slice(0, 6);
const sub = { a: `e2e-a-${tag}`, b: `e2e-b-${tag}` };
const mgr = { a: `mgr-a-${tag}@e2e.example.test`, b: `mgr-b-${tag}@e2e.example.test` };
const invitee = `padmin-${tag}@e2e.example.test`;
const staffEmail = `staff-${tag}@e2e.example.test`;
const secondEmail = `second-${tag}@e2e.example.test`;
let tenantAId = "";

async function useLocale(page: Page, locale: "ar" | "en") {
  await page.context().addCookies([{ name: "locale", value: locale, domain: new URL(adminUrl).hostname, path: "/" }]);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel(en.admin.auth.email).fill(adminEmail);
  await page.getByLabel(en.admin.auth.password).fill(adminPassword);
  await page.getByRole("button", { name: en.admin.auth.signIn }).click();
  await page.waitForURL("**/tenants");
}

async function createTenant(page: Page, name: string, subdomain: string, email: string, d: typeof en = en) {
  await page.goto("/tenants/new");
  await page.getByLabel(d.admin.tenants.displayName).fill(name);
  await page.getByLabel(d.admin.tenants.subdomain).fill(subdomain);
  await page.getByLabel(d.admin.tenants.managerEmail).fill(email);
  await page.getByRole("button", { name: d.admin.tenants.create }).click();
}

test.beforeAll(() => {
  test.skip(!adminEmail || !adminPassword, "E2E platform admin credentials not provided");
});

test.afterAll(async () => {
  const ids = await sql<{ id: string }>(`select id from public.tenants where subdomain in ('${sub.a}','${sub.b}')`).catch(() => []);
  if (!ids.length) return;
  const list = ids.map((r) => `'${r.id}'`).join(",");
  const users = await sql<{ id: string }>(`select auth_user_id id from public.tenant_staff where tenant_id in (${list})`);
  await sql(`set local app.retention_purge = 'on';
    delete from public.tenant_audit_events where tenant_id in (${list});
    delete from public.tenant_security_events where tenant_id in (${list});
    delete from public.staff_invitation_links where tenant_id in (${list});
    delete from public.staff_invitation_roles where tenant_id in (${list});
    delete from public.staff_invitations where tenant_id in (${list});
    delete from public.email_reservations where tenant_id in (${list});
    delete from public.staff_roles where tenant_id in (${list});
    delete from public.tenant_manager_grants where tenant_id in (${list});
    delete from public.session_registry where tenant_id in (${list});
    delete from public.tenant_staff where tenant_id in (${list});
    delete from public.tenants where id in (${list});
    delete from public.platform_invitations where recipient_email_normalized = '${invitee}';`);
  for (const u of users) await adminClient().auth.admin.deleteUser(u.id);
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 200 });
  for (const u of data.users.filter((x) => x.email === invitee)) {
    await sql(`set local app.retention_purge = 'on'; delete from public.session_registry where auth_user_id = '${u.id}'; delete from public.platform_admins where auth_user_id = '${u.id}'`).catch(() => undefined);
    await adminClient().auth.admin.deleteUser(u.id);
  }
});

test("admin signs in and unauthenticated visitors are redirected", async ({ page }) => {
  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  await expect(page.getByRole("heading", { name: en.admin.tenants.title })).toBeVisible();
});

test("creates tenants A and B; invalid and duplicate subdomains are refused in EN and AR; manager emails arrive", async ({ page }) => {
  await signIn(page);
  await createTenant(page, `Org A ${tag}`, sub.a, mgr.a);
  await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}/);
  tenantAId = /\/tenants\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await createTenant(page, `Org B ${tag}`, sub.b, mgr.b);
  await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}/);

  await createTenant(page, "Dup", sub.a, `dup-${tag}@e2e.example.test`);
  await expect(page.getByText(en.admin.errors.subdomain_taken)).toBeVisible();
  await createTenant(page, "Bad", "Bad_Name", `bad-${tag}@e2e.example.test`);
  await expect(page.getByText(en.admin.errors.subdomain_invalid)).toBeVisible();
  await createTenant(page, "Reserved", "admin", `res-${tag}@e2e.example.test`);
  await expect(page.getByText(en.admin.errors.subdomain_reserved)).toBeVisible();

  await useLocale(page, "ar");
  await createTenant(page, "Dup", sub.a, `dup2-${tag}@e2e.example.test`, ar as unknown as typeof en);
  await expect(page.getByText(ar.admin.errors.subdomain_taken)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await useLocale(page, "en");

  for (const [email, s] of [[mgr.a, sub.a], [mgr.b, sub.b]] as const) {
    const body = await waitForMail(email);
    expect(extractLink(body, "/invite/accept?token=")).toContain(`${s}.`);
  }
});

test("edits tenant A's name while the subdomain stays read-only", async ({ page }) => {
  await signIn(page);
  await page.goto(`/tenants/${tenantAId}`);
  await expect(page.getByLabel(en.admin.tenants.subdomain)).toHaveAttribute("readonly", "");
  await page.getByLabel(en.admin.tenants.displayName).fill(`Org A renamed ${tag}`);
  await page.getByRole("button", { name: en.admin.tenants.saveName }).click();
  await expect(page.getByText(en.admin.tenants.nameSaved)).toBeVisible();
  await expect(page.getByLabel(en.admin.tenants.subdomain)).toHaveValue(sub.a);
});

test("suspends and reactivates A behind confirmation dialogs", async ({ page }) => {
  await signIn(page);
  await page.goto(`/tenants/${tenantAId}`);
  await page.getByRole("button", { name: en.admin.tenants.suspend }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: en.admin.common.cancel }).click();
  await expect(page.getByText(en.admin.tenants.stateActive, { exact: true })).toBeVisible(); // cancelled: unchanged
  await page.getByRole("button", { name: en.admin.tenants.suspend }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: en.admin.tenants.confirmSuspend }).click();
  await expect(page.getByText(en.admin.tenants.stateSuspended, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.admin.tenants.reactivate }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: en.admin.tenants.confirmReactivate }).click();
  await expect(page.getByText(en.admin.tenants.stateActive, { exact: true })).toBeVisible();
});

test("grants a manager to existing staff, revokes a non-last manager and refuses to revoke the last one", async ({ page }) => {
  // The first manager has not accepted yet, so tenant A has no staff until this seeding step.
  const seed = async (username: string, email: string) => {
    const { data, error } = await adminClient().auth.admin.createUser({ email, password: "Staff-Pass-12345", email_confirm: true });
    if (error) throw error;
    await sql(`insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, activated_at)
               values ('${tenantAId}', '${data.user.id}', '${email}', '${email}', '${username}', now())`);
  };
  await seed("seeded", staffEmail);
  await seed("second", secondEmail);
  await signIn(page);
  await page.goto(`/tenants/${tenantAId}`);
  const active = page.getByTestId("active-managers");

  await page.getByLabel(en.admin.managers.staffMember).selectOption({ label: `seeded (${staffEmail})` });
  await page.getByRole("button", { name: en.admin.managers.promote }).click();
  await expect(active).toContainText("seeded");
  await expect(page.getByTestId("pending-manager-invitations")).toContainText(mgr.a); // pending invitations do not count

  // `seeded` is the only ACTIVE manager: revoking is refused
  await active.locator("li", { hasText: "seeded" }).getByRole("button", { name: en.admin.managers.revoke }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: en.admin.managers.confirmRevoke }).click();
  await expect(page.getByText(en.admin.errors.last_active_manager)).toBeVisible();
  await expect(active).toContainText("seeded");

  // with a second active manager, one can be revoked
  await page.getByLabel(en.admin.managers.staffMember).selectOption({ label: `second (${secondEmail})` });
  await page.getByRole("button", { name: en.admin.managers.promote }).click();
  await expect(active).toContainText("second");
  await active.locator("li", { hasText: "second" }).getByRole("button", { name: en.admin.managers.revoke }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: en.admin.managers.confirmRevoke }).click();
  await expect(active).not.toContainText("second");
  await expect(active).toContainText("seeded");
});

test("invites a platform admin and the invitee accepts", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/admins/invite");
  await page.getByLabel(en.admin.auth.email).fill(invitee);
  await page.getByLabel(en.admin.capabilities["tenants.manage"]).check();
  await page.getByRole("button", { name: en.admin.admins.sendInvitation }).click();
  await expect(page.getByText(en.admin.admins.invitationSent)).toBeVisible();

  const link = extractLink(await waitForMail(invitee), "/admins/accept?token=");
  const guestContext = await browser.newContext();
  await guestContext.addCookies([{ name: "locale", value: "en", domain: new URL(adminUrl).hostname, path: "/" }]);
  const guest = await guestContext.newPage();
  await guest.goto(link.replace(/^https?:\/\/[^/]+/, process.env.E2E_ADMIN_URL ?? "http://admin.localhost:3001"));
  await guest.getByLabel(en.admin.auth.password, { exact: true }).fill("Invited-Pass-12345");
  await guest.getByLabel(en.admin.auth.confirmPassword).fill("Invited-Pass-12345");
  await guest.getByRole("button", { name: en.admin.admins.accept }).click();
  await guest.waitForURL("**/tenants");
  await expect(guest.getByRole("heading", { name: en.admin.tenants.title })).toBeVisible();
  // single use: the same link is neutral afterwards
  await guest.goto(link.replace(/^https?:\/\/[^/]+/, process.env.E2E_ADMIN_URL ?? "http://admin.localhost:3001"));
  await expect(guest.getByText(en.admin.admins.invitationInvalid)).toBeVisible();
  // no removal / demotion control exists for platform admins
  await page.goto("/admins");
  await expect(page.getByRole("button", { name: /remove|delete|disable|demote|revoke/i })).toHaveCount(0);
});
