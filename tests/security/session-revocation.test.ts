// T125 / FR-020..FR-022, SC-004: session revocation across devices (Development project). Two sign-ins = two devices.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

type Device = Awaited<ReturnType<TwoTenantFixture["staffA"]["signIn"]>>;
const registryId = async (d: Device) =>
  (await sql<{ id: string }>(`select id from public.session_registry where provider_session_id = '${d.sessionId}'`))[0]!.id;
const isLive = async (d: Device) =>
  (await sql<{ ok: boolean }>(`select revoked_at is null as ok from public.session_registry where provider_session_id = '${d.sessionId}'`))[0]!.ok;
/** A protected read through RLS-aware RPCs: denied (error) as soon as the session is dead. */
const canRead = async (d: Device) => !(await d.client.rpc("list_my_sessions")).error;
const canRefresh = async (d: Device) => !(await d.client.auth.refreshSession()).error;
const providerSessions = async (userId: string) =>
  (await sql<{ id: string }>(`select id from auth.sessions where user_id = '${userId}'`)).length;

describe("revoking one other session", () => {
  it("denies the revoked device on its next read and refresh while the current one keeps working", async () => {
    const a = await fx.staffA.signIn();
    const b = await fx.staffA.signIn();
    expect(await canRead(b)).toBe(true);
    const { error } = await a.client.rpc("revoke_my_session", { p_session_id: await registryId(b) });
    expect(error).toBeNull();
    expect(await canRead(b)).toBe(false);
    expect(await canRefresh(b)).toBe(false);
    expect(await canRead(a)).toBe(true);
    expect(await canRefresh(a)).toBe(true);
  });

  it("cannot revoke the current session, a stale id, or sessions of another account or tenant", async () => {
    const a = await fx.staffA.signIn();
    const sameTenantOther = await fx.managerA.signIn();
    const otherTenant = await fx.managerB.signIn();
    for (const target of [a, sameTenantOther, otherTenant]) {
      const r = await a.client.rpc("revoke_my_session", { p_session_id: await registryId(target) });
      expect(r.error?.message).toBe("session_not_found");
    }
    expect((await a.client.rpc("revoke_my_session", { p_session_id: crypto.randomUUID() })).error?.message).toBe("session_not_found");
    expect(await isLive(a)).toBe(true);
    expect(await isLive(sameTenantOther)).toBe(true);
    expect(await isLive(otherTenant)).toBe(true);
    // a manager of the same tenant has no authority over a colleague's session either
    const m = await fx.managerA.signIn();
    expect((await m.client.rpc("revoke_my_session", { p_session_id: await registryId(a) })).error?.message).toBe("session_not_found");
    expect(await canRead(a)).toBe(true);
  });

  it("a double submit is harmless: the second attempt is a neutral not-found", async () => {
    const a = await fx.staffA.signIn();
    const b = await fx.staffA.signIn();
    const id = await registryId(b);
    expect((await a.client.rpc("revoke_my_session", { p_session_id: id })).error).toBeNull();
    expect((await a.client.rpc("revoke_my_session", { p_session_id: id })).error?.message).toBe("session_not_found");
    expect(await canRead(a)).toBe(true);
  });
});

describe("revoking all other sessions", () => {
  it("revoke-all-others racing 10 concurrent refreshes leaves no other session alive", async () => {
    const a = await fx.staffA.signIn();
    const others = await Promise.all([fx.staffA.signIn(), fx.staffA.signIn(), fx.staffA.signIn()]);
    const refreshes = Array.from({ length: 10 }, (_, i) => others[i % others.length]!.client.auth.refreshSession());
    const revoke = a.client.rpc("revoke_my_other_sessions");
    await Promise.allSettled([...refreshes, revoke]);
    for (const o of others) {
      expect(await isLive(o)).toBe(false);
      expect(await canRefresh(o)).toBe(false);
      expect(await canRead(o)).toBe(false);
    }
    expect(await providerSessions(fx.staffA.userId)).toBe(1);
    expect(await canRead(a)).toBe(true);
  });

  it("only touches the caller's own account", async () => {
    const a = await fx.staffA.signIn();
    const mate = await fx.managerA.signIn();
    const foreign = await fx.staffB.signIn();
    await a.client.rpc("revoke_my_other_sessions");
    expect(await canRead(mate)).toBe(true);
    expect(await canRead(foreign)).toBe(true);
  });
});

describe("password change, recovery and administrative revocation", () => {
  it("a password change revokes the others and the current session is revalidated", async () => {
    const a = await fx.staffA.signIn();
    const b = await fx.staffA.signIn();
    const next = `${PASSWORD}-Changed1`;
    expect((await a.client.auth.updateUser({ password: next })).error).toBeNull();
    const { data, error } = await a.client.rpc("revoke_my_other_sessions", { p_reason: "password_change" });
    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(1);
    expect(await canRead(b)).toBe(false);
    expect(await canRefresh(b)).toBe(false);
    expect(await canRefresh(a)).toBe(true); // revalidation of the current session
    expect(await canRead(a)).toBe(true);
    const reasons = await sql<{ r: string }>(`select revoked_reason::text r from public.session_registry where provider_session_id = '${b.sessionId}'`);
    expect(reasons[0]!.r).toBe("password_change");
    await adminClient().auth.admin.updateUserById(fx.staffA.userId, { password: PASSWORD }); // restore for later tests
  });

  it.each(["recovery", "admin_reset"] as const)("%s revokes every session of the account", async (reason) => {
    const a = await fx.staffA.signIn();
    const b = await fx.staffA.signIn();
    const { error } = await adminClient().rpc("svc_revoke_user_sessions", { p_auth_user_id: fx.staffA.userId, p_except_session_id: null as never, p_reason: reason });
    expect(error).toBeNull();
    for (const d of [a, b]) {
      expect(await canRead(d)).toBe(false);
      expect(await canRefresh(d)).toBe(false);
    }
    expect(await providerSessions(fx.staffA.userId)).toBe(0);
  });

  it("disabling the account denies the next request from every session", async () => {
    const a = await fx.staffA.signIn();
    const b = await fx.staffA.signIn();
    await sql(`update public.tenant_staff set enabled = false where id = '${fx.staffA.id}'`);
    try {
      expect(await canRead(a)).toBe(false);
      expect(await canRead(b)).toBe(false);
    } finally {
      await sql(`update public.tenant_staff set enabled = true where id = '${fx.staffA.id}'`);
    }
  });

  it("suspending the tenant denies the next request from every session", async () => {
    const a = await fx.staffA.signIn();
    const m = await fx.managerA.signIn();
    await sql(`update public.tenants set state = 'suspended' where id = '${fx.tenantA.id}'`);
    try {
      expect(await canRead(a)).toBe(false);
      expect(await canRead(m)).toBe(false);
    } finally {
      await sql(`update public.tenants set state = 'active' where id = '${fx.tenantA.id}'`);
    }
    expect(await canRead(a)).toBe(true); // sessions themselves were not revoked: reactivation restores access
  });
});
