// T150 / US5 scenarios 1-2, 5-6: white-label identity per host, neutral fallback, manager-only branding.
// Runs against the portal (project `portal-tenant-a`) on tenant hosts and the Development Supabase project.
import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { en } from "../../packages/i18n/src/dictionaries/en";
import { findDenied } from "../helpers/branding-denylist";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const base = process.env.PORTAL_BASE_DOMAIN ?? "portal.localhost:3000";
const host = (sub: string) => `http://${sub}.${base}`;
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "portal-tenant-a", "one project drives both tenant hosts");
});
test.describe.configure({ mode: "serial" });

let fx: TwoTenantFixture;
const t = en.portal;
const logo = (size: number, colour: string) => sharp({ create: { width: size, height: size, channels: 3, background: colour } }).png().toBuffer();

test.beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
test.afterAll(async () => {
  await fx?.teardown();
});

async function newPage(browser: Browser, sub: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "locale", value: "en", url: host(sub) }]);
  return context.newPage();
}
async function signIn(page: Page, sub: string, identifier: string) {
  await page.goto(`${host(sub)}/login`);
  await page.getByLabel(t.auth.identifier).fill(identifier);
  await page.getByLabel(t.auth.password).fill(PASSWORD);
  await page.getByRole("button", { name: t.auth.signIn }).click();
  await page.waitForURL(`${host(sub)}/`);
}
const nameOf = async (id: string) => (await sql<{ display_name: string }>(`select display_name from public.tenants where id = '${id}'`))[0]!.display_name;

test("login shows each tenant's own name, and the no-logo tenant shows the neutral icon", async ({ browser }) => {
  await sql(`update public.tenants set display_name = 'Hope Charity' where id = '${fx.tenantA.id}';
             update public.tenants set display_name = 'جمعية النور' where id = '${fx.tenantB.id}'`);
  const a = await newPage(browser, fx.tenantA.subdomain);
  await a.goto(`${host(fx.tenantA.subdomain)}/login`);
  await expect(a.getByText("Hope Charity").first()).toBeVisible();
  await expect(a.getByText("جمعية النور")).toHaveCount(0);
  await expect(a.locator("img")).toHaveCount(0); // no logo: a decorative icon, never default artwork
  await expect(a.locator('[aria-hidden="true"] svg').first()).toBeVisible();
  const b = await newPage(browser, fx.tenantB.subdomain);
  await b.goto(`${host(fx.tenantB.subdomain)}/login`);
  await expect(b.getByText("جمعية النور").first()).toBeVisible();
  await expect(b.getByText("Hope Charity")).toHaveCount(0);
});

test("title, icon link and manifest carry only the tenant name or neutral assets, and nothing from the denylist", async ({ browser }) => {
  const page = await newPage(browser, fx.tenantA.subdomain);
  await page.goto(`${host(fx.tenantA.subdomain)}/login`);
  await expect(page).toHaveTitle("Hope Charity");
  const iconHref = await page.locator('link[rel~="icon"]').first().getAttribute("href");
  expect(iconHref).toMatch(/\/icon/);
  expect((await page.request.get(`${host(fx.tenantA.subdomain)}${iconHref}`)).headers()["content-type"]).toContain("image/png");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = (await (await page.request.get(`${host(fx.tenantA.subdomain)}${manifestHref}`)).json()) as { name: string; icons: { src: string }[] };
  expect(manifest.name).toBe("Hope Charity");
  const html = await page.content();
  expect(findDenied(html)).toEqual([]);
  expect(findDenied(JSON.stringify(manifest))).toEqual([]);
  // the operator's own name must not leak onto tenants that are not the operator
  expect(findDenied(`${html} ${JSON.stringify(manifest)}`, { operatorAllowed: false })).toEqual([]);
});

test("the manager uploads, replaces and removes the logo", async ({ browser }) => {
  const page = await newPage(browser, fx.tenantA.subdomain);
  await signIn(page, fx.tenantA.subdomain, fx.managerA.username);
  await page.getByRole("link", { name: t.nav.settings }).click();
  await page.getByRole("link", { name: t.nav.branding }).click();
  await expect(page.getByRole("heading", { name: t.branding.title })).toBeVisible();

  await page.getByLabel(t.branding.logoLabel).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await logo(128, "#087e89") });
  await page.getByRole("button", { name: t.branding.save }).click();
  await expect(page.getByText(t.branding.saved)).toBeVisible();
  await page.goto(`${host(fx.tenantA.subdomain)}/`);
  const img = page.locator('img[alt="Hope Charity"]').first();
  await expect(img).toHaveAttribute("src", /\/branding\/logo\?v=1/);

  await page.goto(`${host(fx.tenantA.subdomain)}/settings/branding`);
  await page.getByLabel(t.branding.logoLabel).setInputFiles({ name: "logo2.png", mimeType: "image/png", buffer: await logo(160, "#b42318") });
  await page.getByRole("button", { name: t.branding.save }).click();
  await expect(page.getByText(t.branding.saved)).toBeVisible();
  await page.goto(`${host(fx.tenantA.subdomain)}/`);
  await expect(page.locator('img[alt="Hope Charity"]').first()).toHaveAttribute("src", /\/branding\/logo\?v=2/);
  // the replaced object is gone from private storage: exactly one object remains for the tenant
  const objs = await sql<{ n: number }>(`select count(*)::int n from storage.objects where bucket_id = 'tenant-logos' and name like '${fx.tenantA.id}/%'`);
  expect(objs[0]!.n).toBe(1);

  // invalid uploads show a localized error and change nothing
  await page.goto(`${host(fx.tenantA.subdomain)}/settings/branding`);
  await page.getByLabel(t.branding.logoLabel).setInputFiles({ name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await page.getByRole("button", { name: t.branding.save }).click();
  await expect(page.getByText(t.errors.logo_type)).toBeVisible();

  await page.goto(`${host(fx.tenantA.subdomain)}/settings/branding`);
  await page.getByLabel(t.branding.removeLogo).check();
  await page.getByRole("button", { name: t.branding.save }).click();
  await expect(page.getByText(t.branding.saved)).toBeVisible();
  await page.goto(`${host(fx.tenantA.subdomain)}/`);
  await expect(page.locator("img")).toHaveCount(0);
  const left = await sql<{ n: number }>(`select count(*)::int n from storage.objects where bucket_id = 'tenant-logos' and name like '${fx.tenantA.id}/%'`);
  expect(left[0]!.n).toBe(0);

  // the manager can also rename; the new name shows in the title
  await page.goto(`${host(fx.tenantA.subdomain)}/settings/branding`);
  await page.getByLabel(t.branding.nameLabel).fill("Hope Foundation");
  await page.getByRole("button", { name: t.branding.save }).click();
  await expect(page.getByText(t.branding.saved)).toBeVisible();
  await expect(page).toHaveTitle("Hope Foundation");
  await page.context().close();
});

test("staff and delegates get no branding navigation, and a direct or forged request is denied", async ({ browser }) => {
  const before = await nameOf(fx.tenantA.id);
  const page = await newPage(browser, fx.tenantA.subdomain);
  await signIn(page, fx.tenantA.subdomain, fx.staffA.username);
  await expect(page.getByRole("link", { name: t.nav.branding })).toHaveCount(0);
  await page.goto(`${host(fx.tenantA.subdomain)}/settings/branding`);
  await expect(page).toHaveURL(/\/forbidden$/);
  // a forged multipart post to the page (what a hand-built server-action call would be) changes nothing
  const res = await page.request.post(`${host(fx.tenantA.subdomain)}/settings/branding`, { multipart: { displayName: "Hacked" } });
  expect(res.status()).not.toBe(200);
  expect(await nameOf(fx.tenantA.id)).toBe(before);
  // and the database refuses the RPC even with a valid staff session
  const { client } = await fx.staffA.signIn();
  const { error } = await client.rpc("update_tenant_branding", { p_display_name: "Hacked", p_logo_object_path: null, p_remove_logo: false });
  expect(error?.code).toBe("42501");
  expect(await nameOf(fx.tenantA.id)).toBe(before);
  await page.context().close();
});
