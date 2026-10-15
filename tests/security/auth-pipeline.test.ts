// Guard pipeline, session registry, audit wrappers, invitation issuance and RLS through the real API,
// against the Development project with two disjoint tenants.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError } from "../../packages/auth/src/errors";
import { getPlatformAdminContext, getTenantStaffContext } from "../../packages/auth/src/server/context";
import { recordPlatformAudit, recordSecurityEvent, recordTenantAudit } from "../../packages/auth/src/server/audit";
import { issueStaffInvitation } from "../../packages/auth/src/server/invitations/issue";
import { registerSession, revokeSessions } from "../../packages/auth/src/server/session-registry";
import { hashToken } from "../../packages/auth/src/tokens";
import { can, loadEffectivePermissions } from "../../packages/authorization/src/evaluate";
import { adminClient, deviceClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

async function loginAndRegister(staff: TwoTenantFixture["staffA"]) {
  const client = deviceClient();
  const { data, error } = await client.auth.signInWithPassword({ email: staff.email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("no session");
  await registerSession({
    supabase: client as never,
    owner: { kind: "staff", authUserId: staff.userId, tenantId: staff.tenantId, staffId: staff.id },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const sessionId = JSON.parse(Buffer.from(data.session.access_token.split(".")[1]!, "base64url").toString()).session_id as string;
  return { client, sessionId };
}

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return e instanceof AuthError ? e.code : `other:${String(e)}`; }
};

describe("session registry + guard pipeline", () => {
  it("registers a session with coarse device data only (no IP / user-agent string columns)", async () => {
    const { sessionId } = await loginAndRegister(fx.staffA);
    const [row] = await sql<Record<string, unknown>>(`select * from public.session_registry where provider_session_id = '${sessionId}'`);
    expect(row).toMatchObject({ tenant_id: fx.tenantA.id, staff_id: fx.staffA.id, device_type: "mobile", browser: "Mobile Safari" });
    expect(Object.keys(row!).filter((k) => /ip|agent|geo|location/i.test(k))).toEqual([]);
  });

  it("returns the staff context for the right tenant and exposes the manager flag", async () => {
    const a = await loginAndRegister(fx.staffA);
    const m = await loginAndRegister(fx.managerA);
    const ctxA = await getTenantStaffContext({ id: fx.tenantA.id }, a.client as never);
    expect(ctxA).toMatchObject({ staffId: fx.staffA.id, tenantId: fx.tenantA.id, isManager: false });
    expect((await getTenantStaffContext({ id: fx.tenantA.id }, m.client as never)).isManager).toBe(true);
  });

  it("treats a user of another tenant as unauthenticated (no disclosure)", async () => {
    const a = await loginAndRegister(fx.staffA);
    expect(await code(getTenantStaffContext({ id: fx.tenantB.id }, a.client as never))).toBe("unauthenticated");
  });

  it("denies an unregistered session, a signed-out client and a revoked session", async () => {
    const bare = deviceClient();
    await bare.auth.signInWithPassword({ email: fx.staffB.email, password: PASSWORD });
    expect(await code(getTenantStaffContext({ id: fx.tenantB.id }, bare as never))).toBe("session_expired");
    expect(await code(getTenantStaffContext({ id: fx.tenantB.id }, deviceClient() as never))).toBe("unauthenticated");

    const b = await loginAndRegister(fx.staffB);
    expect(await code(getTenantStaffContext({ id: fx.tenantB.id }, b.client as never))).toBe("ok");
    expect(await revokeSessions({ providerSessionIds: [b.sessionId] }, "sign_out")).toBe(1);
    // the access token still verifies until expiry (R-03 item 4), so the registry check is what denies it
    expect(await code(getTenantStaffContext({ id: fx.tenantB.id }, b.client as never))).toBe("session_expired");
    const refreshed = await b.client.auth.refreshSession();
    expect(refreshed.error).not.toBeNull();
  });

  it("denies disabled staff and suspended tenants, and recovers when re-enabled", async () => {
    const a = await loginAndRegister(fx.staffA);
    await sql(`update public.tenant_staff set enabled = false where id = '${fx.staffA.id}'`);
    expect(await code(getTenantStaffContext({ id: fx.tenantA.id }, a.client as never))).toBe("forbidden");
    await sql(`update public.tenant_staff set enabled = true where id = '${fx.staffA.id}'`);
    await sql(`update public.tenants set state = 'suspended' where id = '${fx.tenantA.id}'`);
    expect(await code(getTenantStaffContext({ id: fx.tenantA.id }, a.client as never))).toBe("suspended");
    await sql(`update public.tenants set state = 'active' where id = '${fx.tenantA.id}'`);
    expect(await code(getTenantStaffContext({ id: fx.tenantA.id }, a.client as never))).toBe("ok");
  });

  it("revokes all other sessions of a user but keeps the current one", async () => {
    const one = await loginAndRegister(fx.managerB);
    const two = await loginAndRegister(fx.managerB);
    const three = await loginAndRegister(fx.managerB);
    const n = await revokeSessions({ authUserId: fx.managerB.userId, exceptProviderSessionId: one.sessionId }, "user_all_others");
    expect(n).toBeGreaterThanOrEqual(2);
    expect(await code(getTenantStaffContext({ id: fx.tenantB.id }, one.client as never))).toBe("ok");
    expect((await two.client.auth.refreshSession()).error).not.toBeNull();
    expect((await three.client.auth.refreshSession()).error).not.toBeNull();
    const rows = await sql<{ revoked_reason: string | null }>(`select revoked_reason from public.session_registry where provider_session_id in ('${two.sessionId}','${three.sessionId}')`);
    expect(rows.map((r) => r.revoked_reason)).toEqual(["user_all_others", "user_all_others"]);
  });

  it("platform admin context needs a registered platform session", async () => {
    const email = `root2-${Date.now()}@platform.example.test`;
    const admin = adminClient();
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    const id = created.data.user!.id;
    await sql(`insert into public.platform_admins (auth_user_id, capabilities, created_via) values ('${id}', '{tenants.manage}', 'bootstrap')`);
    try {
      const c = deviceClient();
      await c.auth.signInWithPassword({ email, password: PASSWORD });
      expect(await code(getPlatformAdminContext(c as never))).toBe("session_expired");
      await registerSession({ supabase: c as never, owner: { kind: "platform_admin", authUserId: id } });
      const ctx = await getPlatformAdminContext(c as never);
      expect(ctx.capabilities).toEqual(["tenants.manage"]);
      // a platform session never satisfies the tenant guard
      expect(await code(getTenantStaffContext({ id: fx.tenantA.id }, c as never))).toBe("unauthenticated");
    } finally {
      await sql(`delete from public.session_registry where auth_user_id = '${id}'; delete from public.platform_admins where auth_user_id = '${id}'`);
      await admin.auth.admin.deleteUser(id);
    }
  });
});

describe("effective permissions via RPC", () => {
  it("loads grants for the caller only and reflects manager authority", async () => {
    const a = await loginAndRegister(fx.staffA);
    const perms = await loadEffectivePermissions({ supabase: a.client as never });
    expect(perms.isManager).toBe(false);
    expect(can(perms, "staff.view")).toBe(true);
    expect(can(perms, "roles.create")).toBe(false);
    expect(can(perms, "tenant.branding.edit")).toBe(false);
    const m = await loginAndRegister(fx.managerA);
    const mp = await loadEffectivePermissions({ supabase: m.client as never });
    expect(mp.isManager).toBe(true);
    expect(can(mp, "roles.create")).toBe(true);
    expect(can(mp, "tenant.branding.edit")).toBe(true);
  });
  it("is unavailable to an unregistered or revoked session", async () => {
    const bare = deviceClient();
    await bare.auth.signInWithPassword({ email: fx.staffA.email, password: PASSWORD });
    await expect(loadEffectivePermissions({ supabase: bare as never })).rejects.toThrow("permissions_unavailable");
    const a = await loginAndRegister(fx.staffA);
    await revokeSessions({ providerSessionIds: [a.sessionId] }, "sign_out");
    await expect(loadEffectivePermissions({ supabase: a.client as never })).rejects.toThrow();
  });
});

describe("tenant isolation through the real API (JWT + RLS)", () => {
  it("staff.view in tenant A sees tenant-A staff only; tenant B rows are invisible; writes are denied", async () => {
    const a = await loginAndRegister(fx.staffA);
    const own = await a.client.from("tenant_staff").select("id, tenant_id");
    expect(own.error).toBeNull();
    expect(new Set(own.data!.map((r) => r.tenant_id))).toEqual(new Set([fx.tenantA.id]));
    expect(own.data!.length).toBe(2);
    const foreign = await a.client.from("tenant_staff").select("id").eq("tenant_id", fx.tenantB.id);
    expect(foreign.data).toEqual([]);
    expect((await a.client.from("roles").select("id").eq("id", fx.roleB)).data).toEqual([]);
    expect((await a.client.from("tenants").select("id")).data).toEqual([{ id: fx.tenantA.id }]);
    const upd = await a.client.from("tenant_staff").update({ enabled: false }).eq("id", fx.staffB.id);
    expect(upd.error).not.toBeNull();
    expect((await a.client.from("email_reservations").select("*")).error).not.toBeNull();
    expect((await a.client.from("tenant_audit_events").select("*")).error).not.toBeNull();
  });
  it("an anonymous client sees nothing", async () => {
    const anon = deviceClient();
    expect((await anon.from("tenants").select("id")).error).not.toBeNull();
    expect((await anon.from("tenant_staff").select("id")).error).not.toBeNull();
  });
  it("direct calls to private writers and service wrappers are refused for signed-in clients", async () => {
    const a = await loginAndRegister(fx.staffA);
    expect((await a.client.rpc("svc_revoke_sessions" as never, { p_session_ids: [], p_reason: "user" } as never)).error).not.toBeNull();
    expect((await a.client.rpc("svc_write_platform_audit" as never, { p_event: "x" } as never)).error).not.toBeNull();
    expect((await a.client.rpc("svc_load_staff_context" as never, { p_auth_user_id: fx.staffB.userId, p_session_id: fx.staffB.userId } as never)).error).not.toBeNull();
  });
});

describe("audit wrappers", () => {
  it("write rows without secret-like metadata keys", async () => {
    await recordTenantAudit({ tenantId: fx.tenantA.id, actor: { kind: "staff", staffId: fx.managerA.id }, category: "staff", event: "staff.disabled", metadata: { reason: "x", password: "p", nested: { api_token: "t", ok: 1 } } });
    await recordSecurityEvent({ tenantId: fx.tenantA.id, event: "auth.login_failed", metadata: { token: "t", attempt: 2 } });
    await recordPlatformAudit({ adminId: fx.platformAdminId, event: "tenant.created", metadata: { secret: "s", n: 1 } });
    const [t] = await sql<{ metadata: unknown }>(`select metadata from public.tenant_audit_events where tenant_id = '${fx.tenantA.id}' order by id desc limit 1`);
    expect(t!.metadata).toEqual({ reason: "x", nested: { ok: 1 } });
    const [s] = await sql<{ metadata: unknown }>(`select metadata from public.tenant_security_events where tenant_id = '${fx.tenantA.id}' order by id desc limit 1`);
    expect(s!.metadata).toEqual({ attempt: 2 });
    const [p] = await sql<{ metadata: unknown }>(`select metadata from public.platform_audit_events where actor_platform_admin_id = '${fx.platformAdminId}' order by id desc limit 1`);
    expect(p!.metadata).toEqual({ n: 1 });
  });
});

describe("invitation issuance", () => {
  const tenant = () => ({ id: fx.tenantA.id, displayName: "Fixture A", subdomain: fx.tenantA.subdomain });
  const persist = (email: string) => async (tokenHash: string) =>
    (await sql<{ id: string }>(`select private.issue_staff_invitation('${fx.tenantA.id}', '${email}', '{}', false, null, '${fx.platformAdminId}', '${tokenHash}') as id`))[0]!.id;

  it("stores only the token hash, builds a tenant-bound link and sends the email", async () => {
    const sent: { to: string; text: string }[] = [];
    const email = `invitee-${Date.now()}@example.test`;
    const r = await issueStaffInvitation({
      tenant: tenant(), recipientEmail: email, locale: "ar", persist: persist(email),
      mailer: { send: async (m) => void sent.push(m) }, portalBaseDomain: "portal.example.org", appEnv: "production",
      actor: { kind: "platform_admin", id: fx.platformAdminId },
    });
    expect(r.delivered).toBe(true);
    const token = /token=([A-Za-z0-9_-]{43})/.exec(sent[0]!.text)![1]!;
    expect(sent[0]!.text).toContain(`https://${fx.tenantA.subdomain}.portal.example.org/invite/accept?token=`);
    const links = await sql<{ token_hash: string }>(`select token_hash from public.staff_invitation_links where invitation_id = '${r.invitationId}'`);
    expect(links).toEqual([{ token_hash: hashToken(token) }]);
    const raw = await sql(`select 1 from public.staff_invitation_links where token_hash = '${token}'`);
    expect(raw).toHaveLength(0);
  });

  it("audits a delivery failure without the token and keeps the invitation valid", async () => {
    const email = `fail-${Date.now()}@example.test`;
    const r = await issueStaffInvitation({
      tenant: tenant(), recipientEmail: email, locale: "en", persist: persist(email),
      mailer: { send: async () => { throw new Error("smtp down"); } }, portalBaseDomain: "portal.example.org", appEnv: "production",
      actor: { kind: "platform_admin", id: fx.platformAdminId },
    });
    expect(r.delivered).toBe(false);
    const [ev] = await sql<{ event: string; metadata: unknown; resource_id: string }>(
      `select event, metadata, resource_id from public.tenant_audit_events where resource_id = '${r.invitationId}'`);
    expect(ev).toMatchObject({ event: "invitation.delivery_failed", metadata: {} });
    const [inv] = await sql<{ state: string }>(`select state from public.staff_invitations where id = '${r.invitationId}'`);
    expect(inv!.state).toBe("pending");
  });
});
