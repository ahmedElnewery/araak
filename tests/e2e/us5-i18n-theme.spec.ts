// T152 / US5 scenarios 3-4: Arabic RTL by default, English LTR, Dark/Light/System preference persistence.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ar } from "../../packages/i18n/src/dictionaries/ar";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const base = process.env.PORTAL_BASE_DOMAIN ?? "localhost:3000";
const host = (sub: string) => `http://${sub}.${base}`;
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives both tenant hosts");
});
test.describe.configure({ mode: "serial" });

let fx: TwoTenantFixture;
test.beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
test.afterAll(async () => {
  await fx?.teardown();
});

const pageIn = async (browser: Browser, opts: { colorScheme?: "dark" | "light" } = {}) => {
  const context = await browser.newContext({ colorScheme: opts.colorScheme ?? "light" });
  return context.newPage();
};
async function signIn(page: Page, identifier: string, labels: typeof en.portal | typeof ar.portal) {
  const sub = fx.tenantA.subdomain;
  await page.goto(`${host(sub)}/login`);
  await page.getByLabel(labels.auth.identifier).fill(identifier);
  await page.getByLabel(labels.auth.password).fill(PASSWORD);
  await page.getByRole("button", { name: labels.auth.signIn }).click();
  await page.waitForURL(`${host(sub)}/`);
}
const pick = async (page: Page, control: string, option: string) => {
  await page.getByRole("combobox", { name: control }).click();
  await page.getByRole("option", { name: option }).click();
};

test("guests: Arabic RTL by default; English LTR survives a reload (cookie only)", async ({ browser }) => {
  const page = await pageIn(browser);
  await page.goto(`${host(fx.tenantA.subdomain)}/login`);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("button", { name: ar.portal.auth.signIn })).toBeVisible();
  const stored = await sql(`select 1 from public.tenant_preferences where tenant_id = '${fx.tenantA.id}'`);
  expect(stored).toHaveLength(0); // nothing is stored for a guest
  await page.context().addCookies([{ name: "locale", value: "en", url: host(fx.tenantA.subdomain) }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("button", { name: en.portal.auth.signIn })).toBeVisible();
});

test("guests: the theme comes from the cookie before sign-in", async ({ browser }) => {
  const page = await pageIn(browser, { colorScheme: "light" });
  await page.context().addCookies([{ name: "theme", value: "dark", url: host(fx.tenantA.subdomain) }]);
  await page.goto(`${host(fx.tenantA.subdomain)}/login`);
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("usernames and emails render inside bdi[dir=ltr] and data is not rewritten", async ({ browser }) => {
  const page = await pageIn(browser);
  await signIn(page, fx.managerA.username, en.portal);
  await expect(page.locator("bdi[dir=ltr]", { hasText: fx.managerA.username }).first()).toBeVisible();
  await page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await expect(page.locator("bdi[dir=ltr]", { hasText: fx.managerA.email })).toBeVisible();
  await expect(page.getByLabel(en.username.label)).toHaveValue(fx.managerA.username);
});

test("language preference is stored server-side and follows the person to a second browser context", async ({ browser }) => {
  const first = await pageIn(browser);
  await first.context().addCookies([{ name: "locale", value: "en", url: host(fx.tenantA.subdomain) }]);
  await signIn(first, fx.staffA.username, en.portal);
  await pick(first, en.common.language, "العربية");
  await expect(first.locator("html")).toHaveAttribute("dir", "rtl");
  await first.reload();
  await expect(first.locator("html")).toHaveAttribute("dir", "rtl");
  await first.getByRole("button", { name: ar.portal.nav.signOut }).click();
  // a second, empty browser context: sign in (labels follow the default, Arabic) and the stored choice applies
  const second = await pageIn(browser);
  await signIn(second, fx.staffA.username, ar.portal);
  await expect(second.locator("html")).toHaveAttribute("lang", "ar");
  await expect(second.locator("html")).toHaveAttribute("dir", "rtl");
  // switching back to English persists across reload
  await pick(second, ar.common.language, "English");
  await second.reload();
  await expect(second.locator("html")).toHaveAttribute("dir", "ltr");
});

test("System follows the emulated colour scheme; an explicit Dark/Light persists across reload and a second context", async ({ browser }) => {
  const first = await pageIn(browser, { colorScheme: "dark" });
  await first.context().addCookies([{ name: "locale", value: "en", url: host(fx.tenantA.subdomain) }]);
  await signIn(first, fx.managerA.username, en.portal);
  await expect(first.locator("html")).toHaveClass(/dark/); // System + dark OS
  await first.emulateMedia({ colorScheme: "light" });
  await expect(first.locator("html")).not.toHaveClass(/dark/);
  await first.emulateMedia({ colorScheme: "dark" });
  await pick(first, en.common.theme, en.common.themeLight);
  await expect(first.locator("html")).not.toHaveClass(/dark/); // explicit Light beats a dark OS
  await first.reload();
  await expect(first.locator("html")).not.toHaveClass(/dark/);
  await pick(first, en.common.theme, en.common.themeDark);
  await first.reload();
  await expect(first.locator("html")).toHaveClass(/dark/);
  // server-stored: a fresh context with a LIGHT OS still gets Dark after sign-in
  const second = await pageIn(browser, { colorScheme: "light" });
  await second.context().addCookies([{ name: "locale", value: "en", url: host(fx.tenantA.subdomain) }]);
  await signIn(second, fx.managerA.username, en.portal);
  await expect(second.locator("html")).toHaveClass(/dark/);
});
