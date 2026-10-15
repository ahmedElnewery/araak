// GATE-AUTH proof R-02 (T020): login resolution, mailbox-ownership activation, manager
// password confirmation, email immutability trigger, uniform-failure timing, and which
// client IP Supabase Auth rate limits see. Dev project only; scratch schema dropped at end.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, deviceClient } from "../helpers/clients";
import { loadTestEnv } from "../helpers/env";
import { sql } from "../helpers/db";

const admin = adminClient();
const users: string[] = [];
const PASSWORD = "Flow-Pass-1234";
const env = loadTestEnv();

async function mkUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  return data.user;
}

beforeAll(async () => {
  await sql(`
    drop schema if exists proof_auth cascade;
    create schema proof_auth;
    create table proof_auth.staff (auth_user_id uuid primary key, tenant_id uuid not null, username text not null, email text not null);
    create table proof_auth.invite_tokens (token_hash text primary key, email text not null, consumed_at timestamptz,
      expires_at timestamptz not null);
    create function proof_auth.resolve_login(p_tenant uuid, p_username text) returns text
      language sql security definer set search_path = '' stable as
      $$ select email from proof_auth.staff where tenant_id = p_tenant and lower(username) = lower(p_username) $$;
    revoke all on function proof_auth.resolve_login(uuid, text) from public, anon, authenticated;
    grant execute on function proof_auth.resolve_login(uuid, text) to service_role;
    create function proof_auth.redeem(p_hash text) returns text language plpgsql as $$
    declare e text; begin
      update proof_auth.invite_tokens set consumed_at = now()
        where token_hash = p_hash and consumed_at is null and now() < expires_at returning email into e;
      return e; end $$;
    create function proof_auth.block_email_change() returns trigger language plpgsql security definer set search_path = '' as $$
    begin
      if exists (select 1 from proof_auth.staff s where s.auth_user_id = old.id) then
        if new.email is distinct from old.email or coalesce(new.email_change,'') is distinct from coalesce(old.email_change,'') then
          raise exception 'staff_email_immutable' using errcode = 'P0001';
        end if;
      end if; return new; end $$;
    create trigger proof_block_email_change before update of email, email_change on auth.users
      for each row execute function proof_auth.block_email_change();`);
});

afterAll(async () => {
  await sql(`drop trigger if exists proof_block_email_change on auth.users; drop schema if exists proof_auth cascade;`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("R-02 proof", () => {
  it("(1) service-role-only resolver + signInWithPassword gives uniform failures", async () => {
    const tenant = randomUUID();
    const email = `resolve-${randomUUID()}@example.test`;
    const u = await mkUser(email);
    await sql(`insert into proof_auth.staff values ('${u.id}','${tenant}','Ahmed.Ali','${email}')`);
    const priv = await sql<{ anon: boolean; auth: boolean; svc: boolean }>(`
      select has_function_privilege('anon','proof_auth.resolve_login(uuid,text)','execute') anon,
             has_function_privilege('authenticated','proof_auth.resolve_login(uuid,text)','execute') auth,
             has_function_privilege('service_role','proof_auth.resolve_login(uuid,text)','execute') svc`);
    expect(priv[0]).toEqual({ anon: false, auth: false, svc: true });
    const resolved = (await sql<{ r: string | null }>(`select proof_auth.resolve_login('${tenant}','ahmed.ali') r`))[0]!.r;
    expect(resolved).toBe(email);
    const good = await deviceClient().auth.signInWithPassword({ email: resolved!, password: PASSWORD });
    expect(good.error).toBeNull();
    // failure A: known user, wrong password. failure B: unknown username -> dummy email + dummy password.
    const a = await deviceClient().auth.signInWithPassword({ email, password: "Wrong-Pass-9999" });
    const unknown = (await sql<{ r: string | null }>(`select proof_auth.resolve_login('${tenant}','nobody') r`))[0]!.r;
    expect(unknown).toBeNull();
    const b = await deviceClient().auth.signInWithPassword({ email: "no-such-user@example.invalid", password: "Wrong-Pass-9999" });
    expect([a.error?.status, a.error?.code, a.error?.message]).toEqual([b.error?.status, b.error?.code, b.error?.message]);
    expect(a.error?.code).toBe("invalid_credentials");
  });

  it("(2) single-use emailed token redeem + createUser({email_confirm:true}) proves mailbox ownership and activates", async () => {
    const email = `invitee-${randomUUID()}@example.test`;
    const token = randomUUID() + randomUUID();
    const hash = createHash("sha256").update(token).digest("hex");
    await sql(`insert into proof_auth.invite_tokens values ('${hash}','${email}', null, now() + interval '168 hours')`);
    const first = (await sql<{ r: string | null }>(`select proof_auth.redeem('${hash}') r`))[0]!.r;
    const second = (await sql<{ r: string | null }>(`select proof_auth.redeem('${hash}') r`))[0]!.r;
    expect(first).toBe(email);
    expect(second).toBeNull(); // single use
    const { data, error } = await admin.auth.admin.createUser({ email: first!, password: PASSWORD, email_confirm: true });
    expect(error).toBeNull();
    users.push(data.user!.id);
    expect(data.user!.email_confirmed_at).toBeTruthy();
    const si = await deviceClient().auth.signInWithPassword({ email: first!, password: PASSWORD });
    expect(si.error).toBeNull();
    // boundary: expired token cannot be redeemed (DB now() is the authority)
    const h2 = createHash("sha256").update("expired" + token).digest("hex");
    await sql(`insert into proof_auth.invite_tokens values ('${h2}','${email}', null, now() - interval '1 second')`);
    expect((await sql<{ r: string | null }>(`select proof_auth.redeem('${h2}') r`))[0]!.r).toBeNull();
  });

  it("(3) manager own-password check via a throwaway non-persisting client leaves no lingering session", async () => {
    const email = `mgr-${randomUUID()}@example.test`;
    const m = await mkUser(email);
    const before = await sql<{ n: number }>(`select count(*)::int n from auth.sessions where user_id='${m.id}'`);
    const throwaway = deviceClient();
    const { data, error } = await throwaway.auth.signInWithPassword({ email, password: PASSWORD });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
    const during = await sql<{ n: number }>(`select count(*)::int n from auth.sessions where user_id='${m.id}'`);
    expect(during[0]!.n).toBe(before[0]!.n + 1); // sign-in does create a provider session...
    const out = await admin.auth.admin.signOut(data.session!.access_token, "local");
    expect(out.error).toBeNull();
    const after = await sql<{ n: number }>(`select count(*)::int n from auth.sessions where user_id='${m.id}'`);
    expect(after[0]!.n).toBe(before[0]!.n); // ...so it MUST be revoked immediately; then nothing lingers
    const wrong = await deviceClient().auth.signInWithPassword({ email, password: "Wrong-Pass-9999" });
    expect(wrong.error?.code).toBe("invalid_credentials");
  });

  it("(4) BEFORE UPDATE OF email, email_change trigger blocks auth.updateUser({email}) for linked staff only", async () => {
    const email = `immut-${randomUUID()}@example.test`;
    const u = await mkUser(email);
    await sql(`insert into proof_auth.staff values ('${u.id}','${randomUUID()}','immut','${email}')`);
    const c = deviceClient();
    expect((await c.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
    const upd = await c.auth.updateUser({ email: `new-${randomUUID()}@example.test` });
    expect(upd.error).not.toBeNull();
    const adm = await admin.auth.admin.updateUserById(u.id, { email: `new-${randomUUID()}@example.test` });
    expect(adm.error).not.toBeNull();
    const still = await sql<{ email: string; email_change: string }>(`select email, email_change from auth.users where id='${u.id}'`);
    expect(still[0]!.email).toBe(email);
    expect(still[0]!.email_change).toBe("");
    // password change must still work (trigger is column-scoped)
    const pw = await c.auth.updateUser({ password: "Changed-Pass-123" });
    expect(pw.error).toBeNull();
    // unlinked user may still change email path (control): not linked => not blocked by trigger
    const free = await mkUser(`free-${randomUUID()}@example.test`);
    const adm2 = await admin.auth.admin.updateUserById(free.id, { email: `free2-${randomUUID()}@example.test`, email_confirm: true });
    expect(adm2.error).toBeNull();
  });

  it("(5) response-time distributions of uniform sign-in failure paths (sets the T102 tolerance)", async () => {
    const email = `timing-${randomUUID()}@example.test`;
    await mkUser(email);
    const N = 25;
    const sample = async (e: string) => {
      const t: number[] = [];
      for (let i = 0; i < N; i++) {
        const s = performance.now();
        await deviceClient().auth.signInWithPassword({ email: e, password: "Wrong-Pass-9999" });
        t.push(performance.now() - s);
      }
      return t.sort((a, b) => a - b);
    };
    const known = await sample(email);
    const unknown = await sample("nobody-" + randomUUID() + "@example.invalid");
    const stat = (t: number[]) => ({ p50: Math.round(t[Math.floor(N * 0.5)]!), p95: Math.round(t[Math.floor(N * 0.95)]!), max: Math.round(t[N - 1]!) });
    console.log("R-02 timing (ms) known-user wrong-password:", JSON.stringify(stat(known)));
    console.log("R-02 timing (ms) unknown-user:", JSON.stringify(stat(unknown)));
    const gap = Math.abs(stat(known).p50 - stat(unknown).p50);
    console.log("R-02 timing p50 gap (ms):", gap);
    expect(gap).toBeLessThan(250);
  });

  it("(6) Auth rate limits key on the connecting client, not on a spoofed X-Forwarded-For", async () => {
    const patch = (rate: number) =>
      fetch(`https://api.supabase.com/v1/projects/${env.ref}/config/auth`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${env.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rate_limit_token_refresh: rate }),
      });
    const original = await (
      await fetch(`https://api.supabase.com/v1/projects/${env.ref}/config/auth`, { headers: { Authorization: `Bearer ${env.accessToken}` } })
    ).json() as { rate_limit_token_refresh: number };
    try {
      expect((await patch(5)).ok).toBe(true);
      await new Promise((r) => setTimeout(r, 3000));
      const codes: number[] = [];
      for (let i = 0; i < 9; i++) {
        const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: env.publishableKey, "Content-Type": "application/json", "X-Forwarded-For": `203.0.113.${i + 1}` },
          body: JSON.stringify({ email: "nobody@example.invalid", password: "Wrong-Pass-9999" }),
        });
        codes.push(res.status);
      }
      console.log("R-02 status codes with distinct spoofed XFF per request (limit=5):", codes.join(","));
      expect(codes).toContain(429); // limit applied despite 9 different forged client IPs
    } finally {
      await patch(original.rate_limit_token_refresh);
    }
  });
});
