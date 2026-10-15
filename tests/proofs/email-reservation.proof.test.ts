// GATE-AUTH proof R-01 (T019): global email reservation under concurrency, Auth failure
// reconciliation, and email normalization as seen by Supabase Auth.
// Scratch schema only; dropped at the end. Dev project only.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../helpers/clients";
import { sql } from "../helpers/db";

const admin = adminClient();
const createdUsers: string[] = [];

beforeAll(async () => {
  await sql(`
    drop schema if exists proof_email cascade;
    create schema proof_email;
    create table proof_email.staff (email_normalized text primary key, tenant_id uuid not null);
    create table proof_email.reservations (
      email_normalized text primary key, tenant_id uuid not null, invitation_id uuid not null,
      expires_at timestamptz not null);
    create function proof_email.normalize_email(p text) returns text language sql immutable
      as $$ select lower(btrim(p)) $$;
    create function proof_email.claim(p_tenant uuid, p_email text, p_inv uuid, p_expires timestamptz)
    returns boolean language plpgsql as $$
    declare n text := proof_email.normalize_email(p_email); r proof_email.reservations;
    begin
      perform pg_advisory_xact_lock(hashtextextended('email:' || n, 0));
      if exists (select 1 from proof_email.staff where email_normalized = n) then return false; end if;
      select * into r from proof_email.reservations where email_normalized = n;
      if found and r.expires_at > now() and r.invitation_id <> p_inv then return false; end if;
      insert into proof_email.reservations values (n, p_tenant, p_inv, p_expires)
        on conflict (email_normalized) do update
        set tenant_id = excluded.tenant_id, invitation_id = excluded.invitation_id, expires_at = excluded.expires_at;
      return true;
    end $$;`);
});

afterAll(async () => {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  await sql(`drop schema if exists proof_email cascade`);
});

const claim = async (tenant: string, email: string, inv: string, interval = "168 hours") =>
  (await sql<{ claim: boolean }>(
    `select proof_email.claim('${tenant}','${email}','${inv}', now() + interval '${interval}') as claim`,
  ))[0]!.claim;

describe("R-01 proof: global email reservation", () => {
  it("20 concurrent claims for one normalized email from two tenants -> exactly one success", async () => {
    const tenants = [randomUUID(), randomUUID()];
    const variants = ["Race@Example.TEST", " race@example.test ", "RACE@example.test"];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => claim(tenants[i % 2]!, variants[i % 3]!, randomUUID())),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const rows = await sql(`select * from proof_email.reservations where email_normalized = 'race@example.test'`);
    expect(rows).toHaveLength(1);
  });

  it("same invitation may re-claim (idempotent); an activated staff email blocks everyone", async () => {
    const t = randomUUID(), inv = randomUUID();
    expect(await claim(t, "idem@example.test", inv)).toBe(true);
    expect(await claim(t, "IDEM@example.test", inv)).toBe(true);
    expect(await claim(randomUUID(), "idem@example.test", randomUUID())).toBe(false);
    await sql(`insert into proof_email.staff values ('taken@example.test','${t}')`);
    expect(await claim(randomUUID(), " Taken@Example.test", randomUUID())).toBe(false);
  });

  it("an expired reservation is reclaimable", async () => {
    const e = "expired@example.test";
    await sql(`insert into proof_email.reservations values ('${e}','${randomUUID()}','${randomUUID()}', now() - interval '1 second')`);
    expect(await claim(randomUUID(), e, randomUUID())).toBe(true);
  });

  it("Auth Admin failure after a reservation leaves no usable access; reconciliation releases the claim", async () => {
    const t = randomUUID(), inv = randomUUID(), email = `fail-${randomUUID()}@example.test`;
    expect(await claim(t, email, inv)).toBe(true);
    // Simulated provisioning failure: password policy rejects a weak password (also proves FR-016 at Auth).
    const { data, error } = await admin.auth.admin.createUser({ email, password: "weakpass", email_confirm: true });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
    const list = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(list.data.users.some((u) => u.email === email)).toBe(false); // no Auth identity => no sign-in possible
    expect(await sql(`select 1 from proof_email.staff where email_normalized = '${email}'`)).toHaveLength(0);
    // Reconciliation: reservation with no staff row and no Auth user is released once the retry fails/expires.
    await sql(`delete from proof_email.reservations r where r.email_normalized = '${email}'
      and not exists (select 1 from proof_email.staff s where s.email_normalized = r.email_normalized)`);
    expect(await claim(randomUUID(), email, randomUUID())).toBe(true);
  });

  it("Auth user created but staff row never written: no app access; reconciliation deletes the orphan", async () => {
    const email = `orphan-${randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "Orphan-Pass-1", email_confirm: true });
    expect(error).toBeNull();
    const id = data.user!.id;
    // App access requires a tenant_staff row (no row => unauthenticated in getTenantStaffContext).
    expect(await sql(`select 1 from proof_email.staff where email_normalized = '${email}'`)).toHaveLength(0);
    const del = await admin.auth.admin.deleteUser(id);
    expect(del.error).toBeNull();
  });
});

describe("R-01 proof: normalization as seen by Supabase Auth", () => {
  it("Auth lowercases the address and treats case variants as the same identity", async () => {
    const base = `norm-${randomUUID()}@Example.TEST`;
    const a = await admin.auth.admin.createUser({ email: base, password: "Norm-Pass-1234", email_confirm: true });
    expect(a.error).toBeNull();
    createdUsers.push(a.data.user!.id);
    expect(a.data.user!.email).toBe(base.toLowerCase());
    const dup = await admin.auth.admin.createUser({ email: base.toLowerCase(), password: "Norm-Pass-1234", email_confirm: true });
    expect(dup.error).not.toBeNull();
  });

  it("dot/plus variants are DISTINCT Auth identities, so the app must not strip them (decision: trim+lowercase only)", async () => {
    const id = randomUUID().slice(0, 8);
    const plain = await admin.auth.admin.createUser({ email: `dotplus${id}@example.test`, password: "Norm-Pass-1234", email_confirm: true });
    const plus = await admin.auth.admin.createUser({ email: `dotplus${id}+x@example.test`, password: "Norm-Pass-1234", email_confirm: true });
    expect(plain.error).toBeNull();
    expect(plus.error).toBeNull();
    createdUsers.push(plain.data.user!.id, plus.data.user!.id);
    expect(plain.data.user!.id).not.toBe(plus.data.user!.id);
  });
});
