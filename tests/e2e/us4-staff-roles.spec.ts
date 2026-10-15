// T140 / US4 scenarios 1-6, 4a-4g. Runs against the portal (project `portal-tenant-a`) and the Development Supabase project.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const base = process.env.PORTAL_BASE_DOMAIN ?? "portal.localhost:3000";
const host = (sub: string) => `http://${sub}.${base}`;
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives the tenant host");
});
test.describe.configure({ mode: "serial" });

const t = en.portal;
let fx: TwoTenantFixture;
test.beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
test.afterAll(async () => {
  await fx?.teardown();
});

async function signedIn(browser: Browser, username: string): Promise<Page> {
  const sub = fx.tenantA.subdomain;
  const context = await browser.newContext();
  await context.addCookies([{ name: "locale", value: "en", url: host(sub) }]); // the default locale is Arabic
  const page = await context.newPage();
  await page.goto(`${host(sub)}/login`);
  await page.getByLabel(t.auth.identifier).fill(username);
  await page.getByLabel(t.auth.password).fill(PASSWORD);
  await page.getByRole("button", { name: t.auth.signIn }).click();
  await page.waitForURL(`${host(sub)}/`);
  return page;
}
const url = (path: string) => `${host(fx.tenantA.subdomain)}${path}`;
const roleRow = (page: Page, name: string) => page.getByTestId("role-row").filter({ hasText: name });

async function createRole(page: Page, name: string, switchLabel: string) {
  await page.goto(url("/settings/roles/new"));
  await page.getByLabel(t.roles.name, { exact: true }).fill(name);
  await page.getByLabel(switchLabel).check();
  await page.getByRole("button", { name: t.roles.save }).click();
  await page.waitForURL(url("/settings/roles"));
  await expect(roleRow(page, name)).toBeVisible();
}

test("the manager creates two roles and assigns both to a staff member whose navigation shows the union", async ({ browser }) => {
  const manager = await signedIn(browser, fx.managerA.username);
  await createRole(manager, "Alpha", t.roles.switches.manageRoles);
  await createRole(manager, "Beta", t.roles.switches.manageStaff);
  // only plain switches are shown: no scopes, ceiling text or raw permission keys
  await manager.goto(url("/settings/roles/new"));
  await expect(manager.getByText(/roles\.create|staff\.view|scope|ceiling/i)).toHaveCount(0);

  await manager.goto(url("/settings/staff"));
  await manager.getByRole("link", { name: fx.staffA.username }).click();
  await manager.getByLabel("Alpha").check();
  await manager.getByLabel("Beta").check();
  await manager.getByRole("button", { name: t.staff.saveRoles }).click();
  await expect(manager.getByText(t.staff.rolesSaved)).toBeVisible();
  await manager.context().close();

  const staff = await signedIn(browser, fx.staffA.username);
  const nav = staff.getByRole("navigation", { name: t.nav.menu });
  await expect(nav.getByRole("link", { name: t.nav.roles, exact: true })).toBeVisible(); // from Alpha
  await expect(nav.getByRole("link", { name: t.nav.inviteStaff })).toBeVisible(); // from Beta
  await expect(nav.getByRole("link", { name: t.nav.staff, exact: true })).toBeVisible(); // from Viewers
  await staff.context().close();
});

test("self-assignment controls are absent on one's own staff page and a forged request is denied", async ({ browser }) => {
  const staff = await signedIn(browser, fx.staffA.username);
  await staff.goto(url(`/settings/staff/${fx.staffA.id}`));
  await expect(staff.getByText(t.staff.ownRolesNote)).toBeVisible();
  await expect(staff.getByRole("checkbox")).toHaveCount(0);
  await expect(staff.getByRole("button", { name: t.staff.saveRoles })).toHaveCount(0);
  await expect(staff.getByRole("button", { name: t.staff.disable })).toHaveCount(0);
  await staff.context().close();

  // the same request sent directly to the database API (what a forged server action would reach) is refused
  const { client } = await fx.staffA.signIn();
  const [alpha] = await sql<{ id: string }>(`select id from public.roles where tenant_id = '${fx.tenantA.id}' and name = 'Alpha'`);
  const r = await client.rpc("set_staff_roles", { p_staff_id: fx.staffA.id, p_add: [], p_remove: [alpha!.id] });
  expect(r.data).toMatchObject({ ok: false, error: "cannot_change_own_roles" });
  const [still] = await sql<{ n: string }>(`select count(*) n from public.staff_roles where staff_id = '${fx.staffA.id}'`);
  expect(Number(still!.n)).toBe(3);
});

test("the edit form is read-only for a role you hold", async ({ browser }) => {
  const [alpha] = await sql<{ id: string }>(`select id from public.roles where tenant_id = '${fx.tenantA.id}' and name = 'Alpha'`);
  const staff = await signedIn(browser, fx.staffA.username);
  await staff.goto(url(`/settings/roles/${alpha!.id}`));
  await expect(staff.getByText(t.roles.heldNote)).toBeVisible();
  await expect(staff.getByLabel(t.roles.name, { exact: true })).not.toBeEditable();
  await expect(staff.getByRole("button", { name: t.roles.save })).toHaveCount(0);
  await staff.context().close();
});

test("archiving an in-use role shows a localized error and removes nobody", async ({ browser }) => {
  const manager = await signedIn(browser, fx.managerA.username);
  await manager.goto(url("/settings/roles"));
  await roleRow(manager, "Alpha").getByRole("button", { name: t.roles.archive }).click();
  await manager.getByRole("alertdialog").getByRole("button", { name: t.staff.confirm }).click();
  await expect(manager.getByText(t.errors.role_assigned)).toBeVisible();
  const [row] = await sql<{ n: string }>(`select count(*) n from public.staff_roles where staff_id = '${fx.staffA.id}'`);
  expect(Number(row!.n)).toBe(3);
  await manager.context().close();
});

test("restoring into an active-name conflict shows a validation message", async ({ browser }) => {
  const manager = await signedIn(browser, fx.managerA.username);
  await createRole(manager, "Gamma", t.roles.switches.viewStaff);
  await roleRow(manager, "Gamma").getByRole("button", { name: t.roles.archive }).click();
  await manager.getByRole("alertdialog").getByRole("button", { name: t.staff.confirm }).click();
  await expect(manager.getByText(t.roles.archived)).toBeVisible();
  await createRole(manager, "Gamma", t.roles.switches.viewStaff); // the archived name is reusable
  await manager.goto(url("/settings/roles?tab=archived"));
  await roleRow(manager, "Gamma").getByRole("button", { name: t.roles.restore }).click();
  await manager.getByRole("alertdialog").getByRole("button", { name: t.staff.confirm }).click();
  await expect(manager.getByText(t.errors.role_name_conflict)).toBeVisible();
  await manager.context().close();
});

test("disable and enable need a confirmation", async ({ browser }) => {
  const manager = await signedIn(browser, fx.managerA.username);
  await manager.goto(url(`/settings/staff/${fx.staffA.id}`));
  await manager.getByRole("button", { name: t.staff.disable }).click();
  await manager.getByRole("alertdialog").getByRole("button", { name: t.staff.cancel }).click();
  expect((await sql<{ enabled: boolean }>(`select enabled from public.tenant_staff where id = '${fx.staffA.id}'`))[0]!.enabled).toBe(true);
  await manager.getByRole("button", { name: t.staff.disable }).click();
  await manager.getByRole("alertdialog").getByRole("button", { name: t.staff.confirm }).click();
  await expect(manager.getByText(t.staff.disabled)).toBeVisible();
  expect((await sql<{ enabled: boolean }>(`select enabled from public.tenant_staff where id = '${fx.staffA.id}'`))[0]!.enabled).toBe(false);
  await manager.getByRole("button", { name: t.staff.enable }).click();
  await manager.getByRole("alertdialog").getByRole("button", { name: t.staff.confirm }).click();
  await expect(manager.getByText(t.staff.enabled)).toBeVisible();
  await manager.context().close();
});
