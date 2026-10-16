// T171 / US6 scenarios 1-6. Portal tests run in project `portal-tenant-a`, the platform audit test in project `admin`,
// both against the Development Supabase project.
import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const base = process.env.PORTAL_BASE_DOMAIN ?? "localhost:3000";
const adminUrl = process.env.E2E_ADMIN_URL ?? "http://admin.localhost:3001";
const host = (sub: string) => `http://${sub}.${base}`;
const PROJECTS = ["portal-tenant-a", "admin"];
test.describe.configure({ mode: "serial" });

const t = en.portal;
let fx: TwoTenantFixture;
let auditRole = "";
test.beforeAll(async ({}, testInfo) => {
  if (!PROJECTS.includes(testInfo.project.name)) return;
  fx = await createTwoTenantFixture();
  // a delegate limited to staff + roles events (the database supports any approved subset)
  const [role] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${fx.tenantA.id}', 'Auditors') returning id`);
  auditRole = role!.id;
  await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories)
               values ('${fx.tenantA.id}', '${auditRole}', 'audit_logs.view', '{staff,roles}');
             insert into public.staff_roles (tenant_id, staff_id, role_id) values ('${fx.tenantA.id}', '${fx.staffA.id}', '${auditRole}');
             select private.write_tenant_audit('${fx.tenantA.id}', 'staff', '${fx.managerA.id}', null, 'staff', 'staff.disabled', 'tenant_staff', '${fx.staffA.id}', '{}');
             select private.write_tenant_audit('${fx.tenantA.id}', 'staff', '${fx.managerA.id}', null, 'roles', 'role.created', 'role', '${auditRole}', '{}');
             select private.write_tenant_audit('${fx.tenantA.id}', 'staff', '${fx.managerA.id}', null, 'tenant_settings', 'tenant.branding_updated', 'tenant', '${fx.tenantA.id}', '{}');
             select private.write_tenant_audit('${fx.tenantB.id}', 'system', null, null, 'staff', 'staff.enabled', 'tenant_staff', '${fx.staffB.id}', '{}');
             select private.write_security_event('${fx.tenantA.id}', '${fx.staffA.id}', 'authz.denied', '{"reason":"manager_only"}');
             select private.write_platform_audit('${fx.platformAdminId}', null, 'tenant.name_updated', '{"tenantId":"${fx.tenantA.id}"}');`);
});
test.afterAll(async () => {
  await fx?.teardown();
});

async function signedIn(browser: Browser, username: string): Promise<Page> {
  const sub = fx.tenantA.subdomain;
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addCookies([{ name: "locale", value: "en", url: host(sub) }]); // the default locale is Arabic
  const page = await context.newPage();
  await page.goto(`${host(sub)}/login`);
  await page.getByLabel(t.auth.identifier).fill(username);
  await page.getByLabel(t.auth.password, { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: t.auth.signIn }).click();
  await page.waitForURL(`${host(sub)}/`);
  return page;
}
const url = (path: string) => `${host(fx.tenantA.subdomain)}${path}`;
const nav = (page: Page) => page.getByRole("navigation", { name: t.nav.menu });

test.describe("portal", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives the tenant host");
  });

  test("a category-limited delegate sees and exports only the granted categories, and no Security Logs", async ({ browser }) => {
    const page = await signedIn(browser, fx.staffA.username);
    await expect(nav(page).getByRole("link", { name: t.nav.auditLog })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: t.nav.securityLogs })).toHaveCount(0);
    await nav(page).getByRole("link", { name: t.nav.auditLog }).click();
    await expect(page.getByRole("heading", { name: t.audit.title })).toBeVisible();

    const rows = page.getByTestId("audit-row");
    const row = (event: keyof typeof t.audit.events) => rows.filter({ has: page.getByRole("cell", { name: t.audit.events[event], exact: true }) });
    await expect(rows).toHaveCount(2);
    await expect(row("staff.disabled")).toHaveCount(1);
    await expect(row("role.created")).toHaveCount(1);
    await expect(row("tenant.branding_updated")).toHaveCount(0);
    // only the granted categories can be chosen as filters
    await expect(page.getByRole("checkbox", { name: t.audit.categories.staff })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: t.audit.categories.tenant_settings })).toHaveCount(0);

    await page.getByRole("checkbox", { name: t.audit.categories.roles }).check();
    await page.getByRole("button", { name: t.audit.apply }).click();
    await expect(rows).toHaveCount(1);
    await expect(row("role.created")).toHaveCount(1);

    // details open in a sheet with safe metadata only
    await rows.first().getByRole("link", { name: t.audit.viewDetails }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: t.audit.detailTitle })).toBeVisible();
    await expect(sheet.getByText("role.created")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: t.audit.export }).click();
    const csv = await readFile((await (await download).path())!, "utf8");
    expect(csv).toContain("role.created");
    expect(csv).not.toContain("staff.disabled"); // the export kept the roles filter
    expect(csv).not.toContain("tenant.branding_updated");

    await page.goto(url("/security-logs"));
    await expect(page.getByRole("heading", { name: en.errors.forbiddenTitle })).toBeVisible();
    await page.context().close();
  });

  test("the manager sees every administrative category and the Security Logs", async ({ browser }) => {
    const page = await signedIn(browser, fx.managerA.username);
    await nav(page).getByRole("link", { name: t.nav.auditLog }).click();
    const rows = page.getByTestId("audit-row");
    const row = (event: keyof typeof t.audit.events) => rows.filter({ has: page.getByRole("cell", { name: t.audit.events[event], exact: true }) });
    await expect(row("tenant.branding_updated")).toHaveCount(1);
    await expect(row("staff.disabled")).toHaveCount(1);
    await expect(row("staff.enabled")).toHaveCount(0); // tenant B's event

    await nav(page).getByRole("link", { name: t.nav.securityLogs }).click();
    await expect(page.getByRole("heading", { name: t.securityLogs.title })).toBeVisible();
    const securityRows = page.getByTestId("security-row");
    await expect(securityRows).toHaveCount(1);
    await expect(securityRows.getByRole("cell", { name: t.securityLogs.events["authz.denied"], exact: true })).toBeVisible();
    await page.context().close();
  });

  test("staff without the permission get no navigation entry and are denied on a direct URL", async ({ browser }) => {
    await sql(`delete from public.staff_roles where staff_id = '${fx.staffA.id}' and role_id = '${auditRole}'`);
    const page = await signedIn(browser, fx.staffA.username);
    await expect(nav(page).getByRole("link", { name: t.nav.auditLog })).toHaveCount(0);
    await page.goto(url("/audit"));
    await expect(page.getByRole("heading", { name: en.errors.forbiddenTitle })).toBeVisible();
    // the export route re-checks too: the browser lands on the forbidden page instead of receiving a file
    await page.goto(url("/audit/export"));
    await expect(page.getByRole("heading", { name: en.errors.forbiddenTitle })).toBeVisible();
    await page.context().close();
  });

  test("the portal has no platform audit", async ({ browser }) => {
    const page = await signedIn(browser, fx.managerA.username);
    const res = await page.goto(url("/platform-audit"));
    expect(res?.status()).toBe(404);
    await page.context().close();
  });
});

test.describe("admin", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "admin project only");
  });

  test("platform audit is in the admin app, for platform_audit.view only, with platform events only", async ({ browser }) => {
    const [u] = await sql<{ email: string }>(`select email from auth.users where id = '${fx.platformAdminId}'`);
    const context = await browser.newContext();
    await context.addCookies([{ name: "locale", value: "en", domain: new URL(adminUrl).hostname, path: "/" }]);
    const page = await context.newPage();
    const signIn = async () => {
      await page.goto(`${adminUrl}/login`);
      await page.getByLabel(en.admin.auth.email).fill(u!.email);
      await page.getByLabel(en.admin.auth.password, { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: en.admin.auth.signIn }).click();
      await page.waitForURL("**/tenants");
    };
    await signIn();
    const adminNav = page.getByRole("navigation", { name: en.admin.nav.menu });
    await expect(adminNav.getByRole("link", { name: en.admin.nav.audit })).toHaveCount(0);
    await page.goto(`${adminUrl}/audit`);
    await expect(page.getByRole("heading", { name: en.errors.forbiddenTitle })).toBeVisible();

    await sql(`update public.platform_admins set capabilities = capabilities || '{platform_audit.view}' where auth_user_id = '${fx.platformAdminId}'`);
    await page.goto(`${adminUrl}/tenants`);
    await adminNav.getByRole("link", { name: en.admin.nav.audit }).click();
    await expect(page.getByRole("heading", { name: en.admin.audit.title })).toBeVisible();
    await page.getByLabel(en.admin.audit.search).fill(fx.tenantA.id);
    await page.getByRole("button", { name: en.admin.audit.apply }).click();
    const rows = page.getByTestId("platform-audit-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.getByRole("cell", { name: en.admin.audit.events["tenant.name_updated"], exact: true })).toBeVisible();
    await expect(page.getByTestId("platform-audit-row").filter({ hasText: "staff.disabled" })).toHaveCount(0); // tenant audit never appears here
    await context.close();
  });
});
