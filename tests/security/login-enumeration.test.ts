// T102 / FR-014, US2 scenario 6: sign-in and recovery never reveal whether an account exists, and abuse is throttled
// per identifier and per client IP with the same generic response.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestSelfServiceRecovery } from "../../packages/auth/src/server/recovery";
import { signInTenantStaff } from "../../packages/auth/src/server/sign-in";
import { deviceClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const HMAC_KEY = "t102-throttle-hmac-key-0123456789abcdef";
const noHeaders = { get: () => null };
/** research.md R-02 tolerance on the median gap between the unknown-user and wrong-password paths. */
const TOLERANCE_MS = 250;

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

const attempt = (tenantId: string, identifier: string, password: string, extra: { ip?: string; hops?: number } = {}) =>
  signInTenantStaff({
    tenantId, identifier, password, supabase: deviceClient() as never, userAgent: null, hmacKey: HMAC_KEY,
    headers: { get: (n: string) => (n.toLowerCase() === "x-forwarded-for" && extra.ip ? extra.ip : null) },
    trustedProxyHops: extra.hops ?? 0,
  });
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const timed = async (fn: () => Promise<unknown>) => {
  const t = performance.now();
  await fn();
  return performance.now() - t;
};

describe("non-enumerating sign-in", () => {
  it("returns an identical failure for unknown, wrong password, other tenant's email and suspended tenant", async () => {
    const results = await Promise.all([
      attempt(fx.tenantA.id, `ghost${randomUUID().slice(0, 6).replace(/[0-9-]/g, "x")}`, PASSWORD),
      attempt(fx.tenantA.id, fx.staffA.username, "Wrong-Password-1"),
      attempt(fx.tenantA.id, fx.staffB.email, PASSWORD), // tenant B's email on tenant A's host
      attempt(fx.tenantA.id, fx.staffB.username, PASSWORD), // a username that exists only in tenant B
    ]);
    for (const r of results) expect(r).toEqual({ ok: false });
    await sql(`update public.tenants set state = 'suspended' where id = '${fx.tenantB.id}'`);
    expect(await attempt(fx.tenantB.id, fx.staffB.username, PASSWORD)).toEqual({ ok: false });
    await sql(`update public.tenants set state = 'active' where id = '${fx.tenantB.id}'`);
    await sql(`update public.tenant_staff set enabled = false where id = '${fx.staffB.id}'`);
    expect(await attempt(fx.tenantB.id, fx.staffB.username, PASSWORD)).toEqual({ ok: false }); // disabled
    await sql(`update public.tenant_staff set enabled = true where id = '${fx.staffB.id}'`);
  });

  it("signs in with the username in any case and with the email, on the right host only", async () => {
    expect(await attempt(fx.tenantA.id, fx.managerA.username.toUpperCase(), PASSWORD)).toMatchObject({ ok: true, staffId: fx.managerA.id });
    expect(await attempt(fx.tenantA.id, fx.managerA.email.toUpperCase(), PASSWORD)).toMatchObject({ ok: true, staffId: fx.managerA.id });
    expect(await attempt(fx.tenantB.id, fx.managerA.email, PASSWORD)).toEqual({ ok: false });
  });

  it("keeps the median response-time gap between unknown and wrong-password within the R-02 tolerance", async () => {
    const unknown: number[] = [];
    const wrong: number[] = [];
    for (let i = 0; i < 9; i++) {
      unknown.push(await timed(() => attempt(fx.tenantA.id, `nobody${"abcdefghi"[i]!}${"xyzuvwstr"[i]!}`, "Wrong-Password-1")));
      wrong.push(await timed(() => attempt(fx.tenantA.id, fx.staffA.username, "Wrong-Password-1", { ip: undefined })));
    }
    expect(Math.abs(median(unknown) - median(wrong))).toBeLessThan(TOLERANCE_MS);
  }, 120_000);
});

describe("throttling", () => {
  it("throttles an identifier after 5 failures with the same generic response, leaving others unaffected", async () => {
    const victim = fx.managerB; // dedicated to this test so earlier attempts do not interfere
    for (let i = 0; i < 5; i++) expect(await attempt(fx.tenantB.id, victim.username, `Wrong-Password-${String(i)}`)).toEqual({ ok: false });
    expect(await attempt(fx.tenantB.id, victim.username, PASSWORD)).toEqual({ ok: false }); // correct password, throttled
    expect(await attempt(fx.tenantB.id, victim.username.toUpperCase(), PASSWORD)).toEqual({ ok: false }); // same identifier, any case
    expect(await attempt(fx.tenantB.id, fx.staffB.username, PASSWORD)).toMatchObject({ ok: true }); // another identifier
    expect(await attempt(fx.tenantA.id, victim.username, PASSWORD)).toEqual({ ok: false }); // not an account in tenant A anyway
    // the throttle log holds only HMACs: no raw identifier
    const events = await sql<{ metadata: unknown }>(`select metadata from public.tenant_security_events where tenant_id = '${fx.tenantB.id}' and event = 'auth.login_throttled'`);
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(victim.username);
    const rows = await sql(`select 1 from private.auth_attempts where tenant_id = '${fx.tenantB.id}'`);
    expect(JSON.stringify(rows)).not.toContain(victim.username);
  }, 120_000);

  it("throttles a client IP after 20 failures (behind one trusted proxy) without affecting another IP", async () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < 20; i++) {
      await attempt(fx.tenantA.id, `iptest${"abcdefghijklmnopqrst"[i]!}${"abcdefghijklmnopqrst"[19 - i]!}`, "Wrong-Password-1", { ip, hops: 1 });
    }
    // a clean identifier (no failures of its own), so only the IP key can be responsible
    const clean = fx.managerA.email;
    expect(await attempt(fx.tenantA.id, clean, PASSWORD, { ip, hops: 1 })).toEqual({ ok: false }); // correct password, throttled by IP
    expect(await attempt(fx.tenantA.id, clean, PASSWORD, { ip: "198.51.100.8", hops: 1 })).toMatchObject({ ok: true });
    // without a trusted proxy the forwarded header is ignored: no per-IP key exists to throttle
    expect(await attempt(fx.tenantA.id, clean, PASSWORD, { ip, hops: 0 })).toMatchObject({ ok: true });
  }, 180_000);
});

describe("public recovery", () => {
  const run = async (tenant: { id: string; displayName: string; subdomain: string }, identifier: string) => {
    const mails: { to: string }[] = [];
    const deferred: (() => Promise<void>)[] = [];
    const result = await requestSelfServiceRecovery({
      tenant, identifier, headers: noHeaders, hmacKey: HMAC_KEY, trustedProxyHops: 0, locale: "en", appEnv: "test",
      portalBaseDomain: "portal.example.test", mailer: { send: (m) => { mails.push({ to: m.to }); return Promise.resolve(); } },
      defer: (w) => { deferred.push(w); },
    });
    for (const w of deferred) await w();
    return { result, mails };
  };

  it("always returns the same neutral result, mailing only a real account, and stays neutral when throttled", async () => {
    const tenant = { id: fx.tenantA.id, displayName: "A", subdomain: fx.tenantA.subdomain };
    const known = await run(tenant, fx.staffA.username);
    const unknown = await run(tenant, "no.such.person");
    const foreign = await run(tenant, fx.staffB.email);
    expect(known.result).toBeUndefined();
    expect(unknown.result).toBeUndefined();
    expect(foreign.result).toBeUndefined();
    expect(known.mails).toEqual([{ to: fx.staffA.email }]);
    expect(unknown.mails).toEqual([]);
    expect(foreign.mails).toEqual([]);
    // 5 requests per identifier are allowed; later ones return the identical neutral result and do nothing
    for (let i = 0; i < 6; i++) expect((await run(tenant, "spammy.identifier")).result).toBeUndefined();
    const throttled = await run(tenant, "spammy.identifier");
    expect(throttled).toEqual({ result: undefined, mails: [] });
  }, 120_000);
});
