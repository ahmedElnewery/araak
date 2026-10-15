// T072 / security-matrix test 10: host trust and cookie attributes against the RUNNING apps
// (portal on E2E_PORTAL_URL, admin on E2E_ADMIN_URL; defaults http://127.0.0.1:3000 / :3001).
import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { refreshAuthCookies } from "../../packages/auth/src/proxy";
import { deviceClient } from "../helpers/clients";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const PORTAL = new URL(process.env.E2E_PORTAL_URL ?? "http://127.0.0.1:3000");
const ADMIN = new URL(process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:3001");
const PORTAL_BASE = "localhost:3000";
const ADMIN_HOST = "admin.localhost:3001";

function get(base: URL, host: string, headers: Record<string, string> = {}, path = "/") {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request({ host: base.hostname, port: base.port, path, method: "GET", headers: { host, ...headers } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

describe("portal host trust", () => {
  it("serves a real tenant host", async () => {
    const r = await get(PORTAL, `${fx.tenantA.subdomain}.${PORTAL_BASE}`);
    expect(r.status).toBe(200);
  });
  it("always serves the Araak organization at portal.<base> (seeded tenant)", async () => {
    expect((await get(PORTAL, `portal.${PORTAL_BASE}`)).status).toBe(200);
  });
  it("returns a neutral 404 for an unknown subdomain, with no tenant name in the HTML", async () => {
    const r = await get(PORTAL, `nosuch-${Date.now()}.${PORTAL_BASE}`);
    expect(r.status).toBe(404);
    expect(r.body).not.toContain(fx.tenantA.subdomain);
    expect(r.body).not.toContain("Fixture");
  });
  it("rejects hosts that are not a single valid label under the base domain", async () => {
    for (const host of [PORTAL_BASE, `a.b.${PORTAL_BASE}`, `${fx.tenantA.subdomain}.evil.test`, `www.${PORTAL_BASE}`, "127.0.0.1:3000", ADMIN_HOST]) {
      expect((await get(PORTAL, host)).status).toBe(404);
    }
  });
  it("ignores a spoofed X-Forwarded-Host (no trusted proxy)", async () => {
    const r = await get(PORTAL, `nosuch-${Date.now()}.${PORTAL_BASE}`, { "x-forwarded-host": `${fx.tenantA.subdomain}.${PORTAL_BASE}` });
    expect(r.status).toBe(404);
    const ok = await get(PORTAL, `${fx.tenantA.subdomain}.${PORTAL_BASE}`, { "x-forwarded-host": `nosuch.${PORTAL_BASE}` });
    expect(ok.status).toBe(200);
  });
  it("renders html lang/dir from the locale cookie, Arabic RTL by default", async () => {
    const host = `${fx.tenantA.subdomain}.${PORTAL_BASE}`;
    const def = await get(PORTAL, host);
    expect(def.body).toMatch(/<html[^>]*lang="ar"[^>]*dir="rtl"/);
    const en = await get(PORTAL, host, { cookie: "locale=en" });
    expect(en.body).toMatch(/<html[^>]*lang="en"[^>]*dir="ltr"/);
    const bad = await get(PORTAL, host, { cookie: "locale=fr" });
    expect(bad.body).toMatch(/lang="ar"/);
  });
  it("sends security headers and no x-powered-by", async () => {
    const r = await get(PORTAL, `${fx.tenantA.subdomain}.${PORTAL_BASE}`);
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(String(r.headers["content-security-policy"])).toContain("frame-ancestors 'none'");
    const nf = await get(PORTAL, `nosuch.${PORTAL_BASE}`);
    expect(nf.headers["x-powered-by"]).toBeUndefined();
    expect(nf.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("admin host trust", () => {
  it("serves only the exact admin host", async () => {
    expect((await get(ADMIN, ADMIN_HOST)).status).toBe(200);
    for (const host of [`${fx.tenantA.subdomain}.${PORTAL_BASE}`, PORTAL_BASE, `x.${ADMIN_HOST}`, "127.0.0.1:3001"]) {
      expect((await get(ADMIN, host)).status).toBe(404);
    }
    const r = await get(ADMIN, ADMIN_HOST);
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(r.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("auth cookies", () => {
  it("are host-only, httpOnly, SameSite=Lax, with a per-app name", async () => {
    const c = deviceClient();
    const { data } = await c.auth.signInWithPassword({ email: fx.staffA.email, password: PASSWORD });
    const session = data.session!;
    // An expired access token forces the proxy to refresh and therefore to set cookies.
    const stale = { ...session, access_token: `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"exp":1,"sub":"x"}').toString("base64url")}.x`, expires_at: 1 };
    const value = `base64-${Buffer.from(JSON.stringify(stale)).toString("base64url")}`;
    for (const app of ["portal", "admin"] as const) {
      const req = new NextRequest(`http://${fx.tenantA.subdomain}.${PORTAL_BASE}/`, { headers: { cookie: `${app}-auth=${value}` } });
      const res = await refreshAuthCookies(req, app);
      const set = res.headers.getSetCookie().filter((h) => h.startsWith(`${app}-auth`));
      expect(set.length).toBeGreaterThan(0);
      for (const h of set) {
        expect(h).not.toMatch(/;\s*domain=/i);
        expect(h).toMatch(/;\s*httponly/i);
        expect(h).toMatch(/;\s*samesite=lax/i);
      }
    }
  });
});
