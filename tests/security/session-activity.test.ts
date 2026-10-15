// T126 / FR-018, CL-036: only user-initiated, authorized requests renew the 30-day inactivity window.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError } from "../../packages/auth/src/errors";
import { getTenantStaffContext } from "../../packages/auth/src/server/context";
import { isMeaningfulRequest, recordMeaningfulActivity } from "../../packages/auth/src/server/activity";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

const headers = (h: Record<string, string> = {}) => new Headers(h);
const setActivity = (sessionId: string, interval: string) =>
  sql(`update public.session_registry set verified_activity_at = now() - interval '${interval}' where provider_session_id = '${sessionId}'`);
const ageSeconds = async (sessionId: string) =>
  Number((await sql<{ s: string }>(`select extract(epoch from now() - verified_activity_at) s from public.session_registry where provider_session_id = '${sessionId}'`))[0]!.s);
type Device = Awaited<ReturnType<TwoTenantFixture["staffA"]["signIn"]>>;
const ctxOf = (d: Device) => ({ supabase: d.client as never });

describe("which requests count (pure)", () => {
  it("rejects prefetch, passive, HEAD and OPTIONS; accepts navigation and saves", () => {
    expect(isMeaningfulRequest({ headers: headers() })).toBe(true);
    expect(isMeaningfulRequest({ headers: headers(), method: "POST" })).toBe(true);
    expect(isMeaningfulRequest({ headers: headers({ "next-router-prefetch": "1" }) })).toBe(false);
    expect(isMeaningfulRequest({ headers: headers({ purpose: "prefetch" }) })).toBe(false);
    expect(isMeaningfulRequest({ headers: headers({ "sec-purpose": "prefetch;prerender" }) })).toBe(false);
    expect(isMeaningfulRequest({ headers: headers(), passive: true })).toBe(false);
    expect(isMeaningfulRequest({ headers: headers(), method: "HEAD" })).toBe(false);
    expect(isMeaningfulRequest({ headers: headers(), method: "options" })).toBe(false);
  });
});

describe("what does and does not change verified_activity_at", () => {
  it("refreshSession(), prefetch and passive requests do not renew the session", async () => {
    const d = await fx.staffA.signIn();
    await setActivity(d.sessionId, "2 hours");
    await d.client.auth.refreshSession();
    expect(await ageSeconds(d.sessionId)).toBeGreaterThan(7000);
    for (const req of [
      { headers: headers({ "next-router-prefetch": "1" }) },
      { headers: headers({ purpose: "prefetch" }) },
      { headers: headers(), passive: true },
      { headers: headers(), method: "HEAD" },
    ]) {
      expect(await recordMeaningfulActivity(ctxOf(d), req)).toBe(false);
    }
    expect(await ageSeconds(d.sessionId)).toBeGreaterThan(7000);
  });

  it("a denied request (revoked session) never renews and is refused by the database", async () => {
    const d = await fx.staffA.signIn();
    await setActivity(d.sessionId, "2 hours");
    await sql(`update public.session_registry set revoked_at = now(), revoked_reason = 'user' where provider_session_id = '${d.sessionId}'`);
    expect(await recordMeaningfulActivity(ctxOf(d), { headers: headers() })).toBe(false);
    expect(await ageSeconds(d.sessionId)).toBeGreaterThan(7000);
  });

  it("page navigation, a data read and a save renew it (once per 60 s)", async () => {
    const d = await fx.staffA.signIn();
    for (const method of ["GET", "GET", "POST"]) {
      await setActivity(d.sessionId, "2 hours");
      expect(await recordMeaningfulActivity(ctxOf(d), { headers: headers(), method })).toBe(true);
      expect(await ageSeconds(d.sessionId)).toBeLessThan(30);
    }
    // a second request inside 60 s does not write again
    expect(await recordMeaningfulActivity(ctxOf(d), { headers: headers() })).toBe(false);
  });
});

describe("the 30-day boundary", () => {
  const host = () => ({ id: fx.tenantA.id });
  const attempt = async (d: Device) => {
    try {
      await getTenantStaffContext(host(), d.client as never);
      return "allowed";
    } catch (e) {
      return e instanceof AuthError ? e.code : "error";
    }
  };

  it("30 days idle is denied as session_expired (the guard redirects to /login?reason=expired)", async () => {
    const d = await fx.staffA.signIn();
    await setActivity(d.sessionId, "30 days");
    expect(await attempt(d)).toBe("session_expired");
    expect((await d.client.rpc("list_my_sessions")).error).not.toBeNull();
    expect(await recordMeaningfulActivity(ctxOf(d), { headers: headers() })).toBe(false); // a dead session is never revived
  });

  it("29 days 23 hours idle is still allowed", async () => {
    const d = await fx.staffA.signIn();
    await setActivity(d.sessionId, "29 days 23 hours");
    expect(await attempt(d)).toBe("allowed");
    expect((await d.client.rpc("list_my_sessions")).error).toBeNull();
  });
});
