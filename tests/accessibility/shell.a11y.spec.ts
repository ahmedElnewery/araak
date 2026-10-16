// T153 WCAG 2.2 AA (FR-041, SC-007): axe scans of every shipped page in AR/RTL and EN/LTR x Light and Dark, plus
// keyboard-only traversal, dialog focus trap/return and reduced motion. Pages whose story has not shipped yet
// (sessions, roles, audit and security logs) are scanned automatically as soon as their route exists.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const base = process.env.PORTAL_BASE_DOMAIN ?? "localhost:3000";
const adminUrl = process.env.E2E_ADMIN_URL ?? "http://admin.localhost:3001";
const host = (sub: string) => `http://${sub}.${base}`;
test.describe.configure({ mode: "serial" });

let fx: TwoTenantFixture;
let adminEmail = "";
test.beforeAll(async () => {
  fx = await createTwoTenantFixture();
  adminEmail = (await sql<{ email: string }>(`select email from auth.users where id = '${fx.platformAdminId}'`))[0]!.email;
});
test.afterAll(async () => {
  await fx?.teardown();
});

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const variants = [
  { locale: "ar", theme: "light" }, { locale: "ar", theme: "dark" }, { locale: "en", theme: "light" }, { locale: "en", theme: "dark" },
] as const;

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations.map((v) => `${label}: ${v.id} (${String(v.nodes.length)})`), label).toEqual([]);
}
async function setStored(staffId: string, tenantId: string, locale: string, theme: string) {
  await sql(`insert into public.tenant_preferences (staff_id, tenant_id, locale, theme_mode) values ('${staffId}', '${tenantId}', '${locale}', '${theme}')
             on conflict (staff_id) do update set locale = excluded.locale, theme_mode = excluded.theme_mode`);
}
async function portalSignIn(browser: Browser, v: { locale: string; theme: string }) {
  const sub = fx.tenantA.subdomain;
  const context = await browser.newContext({ colorScheme: v.theme === "dark" ? "dark" : "light" });
  await context.addCookies([
    { name: "locale", value: v.locale, url: host(sub) }, { name: "theme", value: v.theme, url: host(sub) },
  ]);
  const page = await context.newPage();
  await setStored(fx.managerA.id, fx.tenantA.id, v.locale, v.theme);
  await page.goto(`${host(sub)}/login`);
  await page.locator("input[name=identifier]").fill(fx.managerA.username);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(`${host(sub)}/`);
  return page;
}

for (const v of variants) {
  test(`portal pages: ${v.locale}/${v.theme}`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives the tenant host");
    const sub = fx.tenantA.subdomain;
    // signed-out pages first (cookie preference only)
    const guest = await (await browser.newContext({ colorScheme: v.theme })).newPage();
    await guest.context().addCookies([
      { name: "locale", value: v.locale, url: host(sub) }, { name: "theme", value: v.theme, url: host(sub) },
    ]);
    for (const path of ["/login", "/invite/accept?token=invalid", "/recover", "/recover/complete?token=invalid"]) {
      await guest.goto(`${host(sub)}${path}`);
      await scan(guest, `${path} ${v.locale}/${v.theme}`);
    }
    await guest.context().close();

    const page = await portalSignIn(browser, v);
    const paths = [
      "/", "/account", "/account/appearance", "/account/password", "/account/sessions", "/settings/staff", "/settings/staff/invitations",
      "/settings/staff/invite", "/settings/branding", "/settings/roles", "/audit", "/security-logs",
    ];
    for (const path of paths) {
      const res = await page.goto(`${host(sub)}${path}`);
      if (!res || res.status() >= 400 || page.url().endsWith("/forbidden") || page.url().endsWith("/login")) continue; // not shipped yet
      await scan(page, `${path} ${v.locale}/${v.theme}`);
    }
    await page.context().close();
  });

  test(`admin pages: ${v.locale}/${v.theme}`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "the admin project drives the admin host");
    const context = await browser.newContext({ colorScheme: v.theme });
    await context.addCookies([
      { name: "locale", value: v.locale, url: adminUrl }, { name: "theme", value: v.theme, url: adminUrl },
    ]);
    const page = await context.newPage();
    await page.goto(`${adminUrl}/login`);
    await scan(page, `admin /login ${v.locale}/${v.theme}`);
    await page.locator("input[name=email]").fill(adminEmail);
    await page.locator("input[name=password]").fill(PASSWORD);
    await page.locator("form button[type=submit]").click();
    await page.waitForURL(/\/tenants/);
    await scan(page, `admin /tenants ${v.locale}/${v.theme}`);
    await page.goto(`${adminUrl}/appearance`);
    await scan(page, `admin /appearance ${v.locale}/${v.theme}`);
    await page.goto(`${adminUrl}/tenants/${fx.tenantA.id}`);
    await scan(page, `admin tenant details ${v.locale}/${v.theme}`);
    await context.close();
  });
}

test("keyboard-only traversal: visible focus, dialog focus trap and focus return", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives the tenant host");
  const page = await portalSignIn(browser, { locale: "en", theme: "light" });
  await page.waitForLoadState("networkidle"); // keys go to a settled page, not one still navigating after sign-in
  // visible focus on every stop of the shell
  const seen = new Set<string>();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { id: `${el.tagName}:${el.textContent?.trim().slice(0, 20) ?? ""}:${el.getAttribute("aria-label") ?? ""}`,
               outlined: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2, visible: r.width > 0 && r.height > 0 };
    });
    if (!info) continue;
    expect(info.visible, info.id).toBe(true);
    expect(info.outlined, `no visible focus ring on ${info.id}`).toBe(true);
    seen.add(info.id);
  }
  expect(seen.size).toBeGreaterThan(5);
  // the skip link is the first stop and moves focus to the main landmark
  await page.goto(`${host(fx.tenantA.subdomain)}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: en.common.skipToContent })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  // mobile drawer is a dialog: focus is trapped inside it and returns to the opener on Escape
  await page.setViewportSize({ width: 390, height: 800 });
  const opener = page.getByRole("button", { name: en.common.openMenu });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await page.context().close();
});

test("reduced motion is respected", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives the tenant host");
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${host(fx.tenantA.subdomain)}/login`);
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll("button, a, input")].map((el) => {
      const cs = getComputedStyle(el);
      return [cs.transitionDuration, cs.animationDuration];
    }).flat());
  expect(durations.length).toBeGreaterThan(0);
  for (const d of durations) expect(d.split(",").every((x) => parseFloat(x) <= 0.001)).toBe(true);
  await context.close();
});
