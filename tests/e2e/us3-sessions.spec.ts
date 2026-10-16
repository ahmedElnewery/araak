// T127 / US3 scenarios 1-6, CL-037..CL-039. Runs against the portal (project `portal-tenant-a`) and the Development project.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const base = process.env.PORTAL_BASE_DOMAIN ?? "localhost:3000";
const host = (sub: string) => `http://${sub}.${base}`;
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives the tenant host");
});
test.describe.configure({ mode: "serial" });

let fx: TwoTenantFixture;
const t = en.portal;
const s = t.sessions;
const UNKNOWN_UA = "UnknownAgent/1.0";

test.beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
test.afterAll(async () => {
  await fx?.teardown();
});

async function device(browser: Browser, userAgent?: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(userAgent ? { userAgent } : {});
  await context.addCookies([{ name: "locale", value: "en", url: host(fx.tenantA.subdomain) }]); // the default locale is Arabic
  // any geolocation request from the page is counted; the page must never make one (CL-037)
  await context.addInitScript(() => {
    (window as unknown as { __geo: number }).__geo = 0;
    if (navigator.geolocation) {
      const bump = () => ((window as unknown as { __geo: number }).__geo += 1);
      navigator.geolocation.getCurrentPosition = () => bump();
      navigator.geolocation.watchPosition = () => (bump(), 0);
    }
  });
  return { context, page: await context.newPage() };
}
async function signIn(page: Page) {
  await page.goto(`${host(fx.tenantA.subdomain)}/login`);
  await page.getByLabel(t.auth.identifier).fill(fx.staffA.username);
  await page.getByLabel(t.auth.password, { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: t.auth.signIn }).click();
  await page.waitForURL(`${host(fx.tenantA.subdomain)}/`);
}
const sessionsUrl = () => `${host(fx.tenantA.subdomain)}/account/sessions`;

let a: Awaited<ReturnType<typeof device>>;
let b: Awaited<ReturnType<typeof device>>;

test("two devices sign in and the sessions page lists both without IP or location", async ({ browser }) => {
  a = await device(browser);
  b = await device(browser, UNKNOWN_UA);
  await signIn(a.page);
  await signIn(b.page);
  await a.page.goto(sessionsUrl());
  await expect(a.page.getByRole("heading", { name: s.title })).toBeVisible();
  await expect(a.page.getByText(s.current)).toHaveCount(1);
  await expect(a.page.getByText(s.unknownDevice)).toBeVisible(); // device B: unknown fallback
  await expect(a.page.getByText(s.unknownBrowser)).toBeVisible();
  await expect(a.page.getByRole("columnheader", { name: s.colSignedIn })).toBeVisible();
  await expect(a.page.getByRole("columnheader", { name: s.colActivity })).toBeVisible();
  const text = await a.page.locator("main").innerText();
  expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/); // no IPv4
  expect(text).not.toMatch(/\bIP\b|location|geolocation|country|city/i);
  expect(await a.page.evaluate(() => (window as unknown as { __geo: number }).__geo)).toBe(0);
});

test("cancelling the individual revoke dialog changes nothing", async () => {
  await a.page.goto(sessionsUrl());
  await a.page.getByRole("button", { name: s.logout, exact: true }).click();
  const dialog = a.page.getByRole("alertdialog");
  await expect(dialog.getByText(s.confirmTitle)).toBeVisible();
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0); // no password step (CL-038)
  await dialog.getByRole("button", { name: s.cancel }).click();
  await expect(dialog).toBeHidden();
  await expect(a.page.getByRole("button", { name: s.logout, exact: true })).toHaveCount(1);
  await b.page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await expect(b.page).toHaveURL(/\/account$/); // device B is still signed in
});

test("confirming revokes the other session and its next navigation goes to login", async () => {
  await a.page.goto(sessionsUrl());
  await a.page.getByRole("button", { name: s.logout, exact: true }).click();
  await a.page.getByRole("alertdialog").getByRole("button", { name: s.confirm }).click();
  await expect(a.page.getByText(s.revoked)).toBeVisible();
  await expect(a.page.getByRole("button", { name: s.logout, exact: true })).toHaveCount(0);
  await b.page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await b.page.waitForURL("**/login**");
  await a.page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await expect(a.page).toHaveURL(/\/account$/); // the current session is untouched
  await b.context.close();
});

test("Logout All Other Sessions: cancel changes nothing, confirm signs the others out", async ({ browser }) => {
  const c = await device(browser);
  const d = await device(browser);
  await signIn(c.page);
  await signIn(d.page);
  await a.page.goto(sessionsUrl());
  await a.page.getByRole("button", { name: s.logoutAll, exact: true }).click();
  const dialog = a.page.getByRole("alertdialog");
  await expect(dialog.getByText(s.confirmAllBody)).toBeVisible(); // explicit warning about every other device
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0); // no password step (CL-039)
  await dialog.getByRole("button", { name: s.cancel }).click();
  await c.page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await expect(c.page).toHaveURL(/\/account$/);
  await a.page.getByRole("button", { name: s.logoutAll, exact: true }).click();
  await a.page.getByRole("alertdialog").getByRole("button", { name: s.confirmAll }).click();
  await expect(a.page.getByText(s.allRevoked)).toBeVisible();
  for (const other of [c, d]) {
    await other.page.goto(`${host(fx.tenantA.subdomain)}/account`);
    await other.page.waitForURL("**/login**");
    await other.context.close();
  }
  await a.page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await expect(a.page).toHaveURL(/\/account$/);
});

test("a browser restart (reused storageState) stays signed in", async ({ browser }) => {
  const state = await a.context.storageState();
  const restarted = await browser.newContext({ storageState: state });
  const page = await restarted.newPage();
  await page.goto(`${host(fx.tenantA.subdomain)}/account`);
  await expect(page).toHaveURL(/\/account$/);
  await restarted.close();
  await a.context.close();
});
