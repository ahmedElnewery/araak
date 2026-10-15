// GATE-AUTH proof R-03 (T018): provider session revocation, JWT lifetime, refresh.
// Runs against the Development Supabase project only (see tests/helpers/env.ts).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, decodeJwt, deviceClient } from "../helpers/clients";
import { sql } from "../helpers/db";

const PASSWORD = "Proof-Pass-1234";
const admin = adminClient();
const email = `proof-r03-${randomUUID()}@example.test`;
let userId = "";

async function signInDevice() {
  const c = deviceClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("no session");
  const claims = decodeJwt(data.session.access_token);
  return { client: c, session: data.session, sessionId: claims.session_id as string, claims };
}

async function sessionRows(): Promise<string[]> {
  const rows = await sql<{ id: string }>(`select id from auth.sessions where user_id = '${userId}' order by created_at`);
  return rows.map((r) => r.id);
}

beforeAll(async () => {
  await sql(`create schema if not exists proof_scratch;
    create or replace function proof_scratch.revoke_session(p_id uuid) returns void
      language sql security definer set search_path = '' as $$ delete from auth.sessions where id = p_id $$;
    revoke all on function proof_scratch.revoke_session(uuid) from public, anon, authenticated;
    grant usage on schema proof_scratch to service_role;
    grant execute on function proof_scratch.revoke_session(uuid) to service_role;`);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await sql(`drop schema if exists proof_scratch cascade`);
});

describe("R-03 proof: sessions", () => {
  it("(0) the configured access-token lifetime is exactly 300 seconds", async () => {
    const a = await signInDevice();
    expect((a.claims.exp as number) - (a.claims.iat as number)).toBe(300);
  });

  it("(1) the access-token session_id claim identifies a provider session row", async () => {
    const a = await signInDevice();
    expect(await sessionRows()).toContain(a.sessionId);
    expect(a.claims.sub).toBe(userId);
  });

  it("(2) deleting one auth.sessions row via a SECURITY DEFINER fn blocks refresh for that session only", async () => {
    const a = await signInDevice();
    const b = await signInDevice();
    const { error } = await admin.schema("proof_scratch" as never).rpc("revoke_session" as never, { p_id: a.sessionId } as never);
    // proof_scratch is not API-exposed: do it with SQL as the definer-function owner instead
    if (error) await sql(`select proof_scratch.revoke_session('${a.sessionId}')`);
    const ra = await a.client.auth.refreshSession({ refresh_token: a.session.refresh_token });
    expect(ra.error).not.toBeNull();
    expect(ra.data.session).toBeNull();
    const rb = await b.client.auth.refreshSession({ refresh_token: b.session.refresh_token });
    expect(rb.error).toBeNull();
    expect(rb.data.session?.access_token).toBeTruthy();
  });

  it("(2b) auth.admin.signOut(jwt,'local') ends only that session", async () => {
    const a = await signInDevice();
    const b = await signInDevice();
    const { error } = await admin.auth.admin.signOut(a.session.access_token, "local");
    expect(error).toBeNull();
    expect((await a.client.auth.refreshSession({ refresh_token: a.session.refresh_token })).error).not.toBeNull();
    expect((await b.client.auth.refreshSession({ refresh_token: b.session.refresh_token })).error).toBeNull();
  });

  it("(3) scope 'others' keeps the current session and ends the rest", async () => {
    const a = await signInDevice();
    const b = await signInDevice();
    const c = await signInDevice();
    const { error } = await admin.auth.admin.signOut(a.session.access_token, "others");
    expect(error).toBeNull();
    const rows = await sessionRows();
    expect(rows).toContain(a.sessionId);
    expect(rows).not.toContain(b.sessionId);
    expect(rows).not.toContain(c.sessionId);
    expect((await b.client.auth.refreshSession({ refresh_token: b.session.refresh_token })).error).not.toBeNull();
    expect((await a.client.auth.refreshSession({ refresh_token: a.session.refresh_token })).error).toBeNull();
  });

  it("(4) an already-issued access token still verifies until expiry after its session is deleted", async () => {
    const a = await signInDevice();
    await sql(`select proof_scratch.revoke_session('${a.sessionId}')`);
    expect(await sessionRows()).not.toContain(a.sessionId);
    // Local, signature-only verification: the stateless check that RLS (auth.jwt()) relies on.
    const { data, error } = await deviceClient().auth.getClaims(a.session.access_token);
    expect(error).toBeNull();
    expect(data?.claims.session_id).toBe(a.sessionId);
    const exp = decodeJwt(a.session.access_token).exp as number;
    expect(exp * 1000).toBeGreaterThan(Date.now());
    // => the app-side registry check (private.current_session_is_live) IS required.
  });

  it("(5) refresh racing revocation never resurrects a session", async () => {
    const results: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = await signInDevice();
      const [refreshed] = await Promise.all([
        a.client.auth.refreshSession({ refresh_token: a.session.refresh_token }),
        sql(`select proof_scratch.revoke_session('${a.sessionId}')`),
      ]);
      // Whatever the interleaving, once revocation committed nothing may refresh again.
      await sql(`select 1`);
      const again = refreshed.data.session
        ? await deviceClient().auth.refreshSession({ refresh_token: refreshed.data.session.refresh_token })
        : null;
      const original = await deviceClient().auth.refreshSession({ refresh_token: a.session.refresh_token });
      expect(await sessionRows()).not.toContain(a.sessionId);
      expect(original.data.session).toBeNull();
      if (again) expect(again.data.session).toBeNull();
      results.push(refreshed.data.session ? "refresh-won-then-dead" : "revoke-won");
    }
    console.log("R-03 race outcomes:", results.join(","));
  });

  it(
    "(6) real time: after 300s the access token is expired but the refresh token still issues a new one",
    async () => {
      const a = await signInDevice();
      const exp = decodeJwt(a.session.access_token).exp as number;
      await new Promise((r) => setTimeout(r, Math.max(0, exp * 1000 - Date.now()) + 5_000));
      expect(Date.now()).toBeGreaterThan(exp * 1000);
      // expired token is rejected by the server
      const stale = await adminClient().auth.getUser(a.session.access_token);
      expect(stale.error).not.toBeNull();
      const r = await a.client.auth.refreshSession({ refresh_token: a.session.refresh_token });
      expect(r.error).toBeNull();
      const claims = decodeJwt(r.data.session!.access_token);
      expect(claims.session_id).toBe(a.sessionId);
      expect((claims.exp as number) - (claims.iat as number)).toBe(300);
    },
    120_000 + 300_000,
  );

  it("(7) a rotated refresh token replayed after the reuse interval is rejected (observed behaviour recorded)", async () => {
    const a = await signInDevice();
    const r1 = await a.client.auth.refreshSession({ refresh_token: a.session.refresh_token });
    expect(r1.error).toBeNull();
    await new Promise((r) => setTimeout(r, 12_000));
    // Observation A: replay of the immediate parent after >10s while the child is unused.
    const replayParent = await deviceClient().auth.refreshSession({ refresh_token: a.session.refresh_token });
    console.log("R-03 replay of parent token after 12s, child unused:", replayParent.error ? "rejected" : "ACCEPTED");
    // Rotate again so the original token is now a grandparent, then replay it after the interval.
    const r2 = await deviceClient().auth.refreshSession({ refresh_token: r1.data.session!.refresh_token });
    expect(r2.error).toBeNull();
    await new Promise((r) => setTimeout(r, 12_000));
    const replayOld = await deviceClient().auth.refreshSession({ refresh_token: a.session.refresh_token });
    expect(replayOld.data.session).toBeNull();
    console.log("R-03 replay of grandparent token after 12s:", replayOld.error ? "rejected" : "ACCEPTED");
  });
});
