// T169 / FR-030, FR-032, SC-006, Constitution VI: every in-scope administrative operation leaves exactly one event in
// the correct log (tenant audit, Security Log or platform audit), with actor, time, scope and safe ids only, and plain
// reads leave none. Runs against the Development project.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateToken, hashToken } from "../../packages/auth/src/tokens";
import { adminClient, deviceClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

type Client = ReturnType<typeof deviceClient>;
type Row = {
  log: "tenant" | "security" | "platform"; id: string; tenant_id: string | null; event: string; category: string | null;
  actor_kind: string | null; actor_staff_id: string | null; actor_platform_admin_id: string | null; occurred_at: string; metadata: unknown;
};
type Expectation = {
  log: Row["log"]; event: string; tenantId?: string; category?: string;
  actor?: { staff: string } | { platformAdmin: string } | "system";
  where?: (r: Row) => boolean;
};

const tag = randomUUID().slice(0, 8);
const letters = tag.replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]!); // usernames are letters only
const secrets: string[] = [PASSWORD]; // every raw token and password used below; none may appear in any event
const token = () => {
  const t = generateToken();
  secrets.push(t);
  return t;
};

let fx: TwoTenantFixture;
let platform: Client;
let manager: Client;
let staff: Client;
let newTenantId = "";
let inviteeStaffId = "";
const written: Row[] = [];

async function platformSignIn(): Promise<Client> {
  const [u] = await sql<{ email: string }>(`select email from auth.users where id = '${fx.platformAdminId}'`);
  const client = deviceClient();
  const { data, error } = await client.auth.signInWithPassword({ email: u!.email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("platform sign-in failed");
  const sessionId = JSON.parse(Buffer.from(data.session.access_token.split(".")[1]!, "base64url").toString()).session_id as string;
  await sql(`insert into public.session_registry (provider_session_id, auth_user_id, platform_admin_id, verified_activity_at)
             values ('${sessionId}', '${fx.platformAdminId}', '${fx.platformAdminId}', now())`);
  return client;
}

async function marks() {
  const [m] = await sql<{ t: string; s: string; p: string }>(`select
    (select coalesce(max(id), 0) from public.tenant_audit_events) t,
    (select coalesce(max(id), 0) from public.tenant_security_events) s,
    (select coalesce(max(id), 0) from public.platform_audit_events) p`);
  return m!;
}

/** Rows written since `m` that belong to this test (its tenants, its platform admins). */
async function since(m: Awaited<ReturnType<typeof marks>>): Promise<Row[]> {
  const tenants = [fx.tenantA.id, fx.tenantB.id, newTenantId].filter(Boolean).map((i) => `'${i}'`).join(",");
  return sql<Row>(`
    select 'tenant' log, id::text, tenant_id::text, event, category, actor_kind, actor_staff_id::text, actor_platform_admin_id::text, occurred_at, metadata
      from public.tenant_audit_events where id > ${m.t} and tenant_id in (${tenants})
    union all
    select 'security', id::text, tenant_id::text, event, null, null, actor_staff_id::text, null, occurred_at, metadata
      from public.tenant_security_events where id > ${m.s} and tenant_id in (${tenants})
    union all
    select 'platform', id::text, null, event, null, null, null, actor_platform_admin_id::text, occurred_at, metadata
      from public.platform_audit_events where id > ${m.p}
       and (actor_platform_admin_id in (select auth_user_id from public.platform_admins where auth_user_id = '${fx.platformAdminId}')
            or actor_platform_admin_id in (select id from auth.users where email like '%-${tag}@platform.example.test')
            or metadata ->> 'tenantId' in (${tenants}))`);
}

/** Runs `op` and asserts every expectation matches exactly one new row, and that nothing lands in an unexpected log. */
async function expectEvents(op: () => Promise<unknown>, expected: Expectation[], opts: { allowOther?: string[] } = {}) {
  const m = await marks();
  const started = Date.now();
  await op();
  const rows = await since(m);
  written.push(...rows);
  for (const e of expected) {
    const hits = rows.filter((r) => r.log === e.log && r.event === e.event && (!e.where || e.where(r)));
    expect(hits, `${e.log}: ${e.event}`).toHaveLength(1);
    const r = hits[0]!;
    expect(Math.abs(new Date(r.occurred_at).getTime() - started)).toBeLessThan(60_000);
    if (e.tenantId) expect(r.tenant_id, `${e.event} tenant`).toBe(e.tenantId);
    if (e.category) expect(r.category, `${e.event} category`).toBe(e.category);
    if (e.actor === "system") expect(r.actor_kind).toBe("system");
    else if (e.actor && "staff" in e.actor) expect(r.log === "tenant" ? [r.actor_kind, r.actor_staff_id] : [r.actor_staff_id]).toEqual(r.log === "tenant" ? ["staff", e.actor.staff] : [e.actor.staff]);
    else if (e.actor && "platformAdmin" in e.actor) {
      expect(r.actor_platform_admin_id).toBe(e.actor.platformAdmin);
      if (r.log === "tenant") expect(r.actor_kind).toBe("platform_admin");
    }
  }
  // nothing in a log the operation should not touch (e.g. a tenant-only change never writes platform audit)
  const allowed = new Set([...expected.map((e) => `${e.log}:${e.event}`), ...(opts.allowOther ?? [])]);
  const unexpected = rows.filter((r) => !allowed.has(`${r.log}:${r.event}`));
  expect(unexpected.map((r) => `${r.log}:${r.event}`)).toEqual([]);
  return rows;
}

const ok = <T>(r: { data: T; error: unknown }) => {
  expect(r.error, JSON.stringify(r.error)).toBeNull();
  return r.data;
};

beforeAll(async () => {
  fx = await createTwoTenantFixture();
  await sql(`update public.platform_admins set capabilities = '{tenants.manage,tenants.managers.manage,platform_admins.invite,platform_audit.view}'
             where auth_user_id = '${fx.platformAdminId}'`);
  platform = await platformSignIn();
  manager = (await fx.managerA.signIn()).client;
  staff = (await fx.staffA.signIn()).client;
});

afterAll(async () => {
  if (!fx) return;
  await sql(`delete from public.platform_invitations where invited_by = '${fx.platformAdminId}'`).catch(() => undefined);
  await fx.teardown();
});

describe("tenant lifecycle (platform)", () => {
  it("create, suspend, reactivate and rename each write one platform and one tenant event", async () => {
    const pa = { platformAdmin: fx.platformAdminId };
    await expectEvents(async () => {
      newTenantId = ok(await platform.rpc("platform_create_tenant", {
        p_display_name: `Coverage ${tag}`, p_subdomain: `cov-${tag}`, p_state: "active",
        p_manager_email: `first-manager-${tag}@example.test`, p_token_hash: hashToken(token()),
      })) as unknown as string;
      fx.trackTenant(newTenantId);
    }, [
      { log: "platform", event: "tenant.created", actor: pa },
      { log: "tenant", event: "tenant.created", category: "tenant_settings", actor: pa, where: (r) => r.tenant_id === newTenantId },
    ], { allowOther: ["tenant:invitation.issued"] });
    for (const [state, event] of [["suspended", "tenant.suspended"], ["active", "tenant.activated"]] as const) {
      await expectEvents(() => platform.rpc("platform_set_tenant_state", { p_tenant_id: newTenantId, p_state: state }).then(ok), [
        { log: "platform", event, actor: pa },
        { log: "tenant", event, tenantId: newTenantId, category: "tenant_settings", actor: pa },
      ]);
    }
    await expectEvents(() => platform.rpc("platform_update_tenant_name", { p_tenant_id: newTenantId, p_display_name: `Renamed ${tag}` }).then(ok), [
      { log: "platform", event: "tenant.name_updated", actor: pa },
      { log: "tenant", event: "tenant.name_updated", tenantId: newTenantId, category: "tenant_settings", actor: pa },
    ]);
  });
});

describe("invitations and managers", () => {
  it("invite, resend and redeem a staff member, then grant and revoke manager authority", async () => {
    const mgr = { staff: fx.managerA.id };
    const email = `invitee-${tag}@example.test`;
    let invitationId = "";
    await expectEvents(async () => {
      invitationId = ok(await manager.rpc("invite_staff", { p_email: email, p_role_ids: [], p_token_hash: hashToken(token()) })) as unknown as string;
    }, [{ log: "tenant", event: "invitation.issued", tenantId: fx.tenantA.id, category: "invitations", actor: mgr }]);

    await sql(`update public.staff_invitation_links set issued_at = issued_at - interval '901 seconds', expires_at = expires_at - interval '901 seconds'
               where invitation_id = '${invitationId}'`);
    const resent = token();
    await expectEvents(() => manager.rpc("resend_staff_invitation", { p_invitation_id: invitationId, p_token_hash: hashToken(resent) }).then(ok), [
      { log: "tenant", event: "invitation.resent", tenantId: fx.tenantA.id, category: "invitations", actor: mgr },
    ]);

    const { data: user, error } = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    fx.trackUser(user.user.id);
    await expectEvents(async () => {
      inviteeStaffId = ok(await adminClient().rpc("svc_redeem_staff_invitation", {
        p_token_hash: hashToken(resent), p_auth_user_id: user.user.id, p_username: `invitee${letters}`, p_first_name: "Audit", p_last_name: "Coverage",
      })) as unknown as string;
    }, [{ log: "tenant", event: "staff.activated", tenantId: fx.tenantA.id, category: "staff", where: (r) => r.actor_staff_id === inviteeStaffId }]);

    const pa = { platformAdmin: fx.platformAdminId };
    await expectEvents(() => platform.rpc("platform_grant_tenant_manager", { p_tenant_id: fx.tenantA.id, p_staff_id: inviteeStaffId }).then(ok), [
      { log: "platform", event: "manager.granted", actor: pa },
      { log: "tenant", event: "manager.granted", tenantId: fx.tenantA.id, category: "staff", actor: pa },
    ]);
    await expectEvents(() => platform.rpc("platform_revoke_tenant_manager", { p_tenant_id: fx.tenantA.id, p_staff_id: inviteeStaffId }).then(ok), [
      { log: "platform", event: "manager.revoked", actor: pa },
      { log: "tenant", event: "manager.revoked", tenantId: fx.tenantA.id, category: "staff", actor: pa },
    ]);
  });
});

describe("staff and roles", () => {
  it("username change, role lifecycle, role assignment and disable/enable", async () => {
    const mgr = { staff: fx.managerA.id };
    const t = { tenantId: fx.tenantA.id };
    await expectEvents(() => staff.rpc("change_my_username", { p_username: `renamed${letters}` }).then(ok), [
      { log: "tenant", event: "staff.username_changed", ...t, category: "staff", actor: { staff: fx.staffA.id } },
    ]);

    let roleId = "";
    await expectEvents(async () => {
      const r = ok(await manager.rpc("create_role", { p_name: `Covered ${tag}`, p_description: null as never, p_grants: [{ key: "staff.view" }] })) as { ok: boolean; roleId: string };
      expect(r.ok).toBe(true);
      roleId = r.roleId;
    }, [{ log: "tenant", event: "role.created", ...t, category: "roles", actor: mgr }]);
    const roleOp = (fn: "archive_role" | "restore_role", event: string) =>
      expectEvents(async () => expect(ok(await manager.rpc(fn, { p_role_id: roleId }))).toMatchObject({ ok: true }), [
        { log: "tenant", event, ...t, category: "roles", actor: mgr },
      ]);
    await expectEvents(async () => {
      expect(ok(await manager.rpc("update_role", { p_role_id: roleId, p_name: `Covered ${tag}`, p_description: "x", p_grants: [{ key: "roles.view" }] }))).toMatchObject({ ok: true });
    }, [{ log: "tenant", event: "role.updated", ...t, category: "roles", actor: mgr }]);
    for (const [add, remove, event] of [[[roleId], [], "staff.role_added"], [[], [roleId], "staff.role_removed"]] as const) {
      await expectEvents(async () => {
        expect(ok(await manager.rpc("set_staff_roles", { p_staff_id: inviteeStaffId, p_add: [...add], p_remove: [...remove] }))).toMatchObject({ ok: true });
      }, [{ log: "tenant", event, ...t, category: "staff", actor: mgr }]);
    }
    await roleOp("archive_role", "role.archived");
    await roleOp("restore_role", "role.restored");

    for (const [fn, event] of [["disable_staff", "staff.disabled"], ["enable_staff", "staff.enabled"]] as const) {
      await expectEvents(async () => expect(ok(await manager.rpc(fn, { p_staff_id: inviteeStaffId }))).toMatchObject({ ok: true }), [
        { log: "tenant", event, ...t, category: "staff", actor: mgr },
      ]);
    }
  });

  it("a denied privileged attempt writes a Security Log event and an audited denial", async () => {
    const [role] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${fx.tenantA.id}', 'Creators ${tag}') returning id`);
    await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key) values ('${fx.tenantA.id}', '${role!.id}', 'roles.create');
               insert into public.staff_roles (tenant_id, staff_id, role_id) values ('${fx.tenantA.id}', '${fx.staffA.id}', '${role!.id}')`);
    await expectEvents(async () => {
      expect(ok(await staff.rpc("create_role", { p_name: "Escalate", p_description: null as never, p_grants: [{ key: "staff.disable" }] }))).toMatchObject({ ok: false });
    }, [
      { log: "security", event: "authz.privilege_escalation_denied", tenantId: fx.tenantA.id, actor: { staff: fx.staffA.id } },
      { log: "tenant", event: "role.create_denied", tenantId: fx.tenantA.id, category: "roles", actor: { staff: fx.staffA.id } },
    ]);
  });
});

describe("settings, sessions and recovery", () => {
  it("a branding change is a tenant settings event", async () => {
    await expectEvents(() => manager.rpc("update_tenant_branding", { p_display_name: `Branded ${tag}`, p_logo_object_path: null as never, p_remove_logo: false }).then(ok), [
      { log: "tenant", event: "tenant.branding_updated", tenantId: fx.tenantA.id, category: "tenant_settings", actor: { staff: fx.managerA.id } },
    ]);
  });

  it("revoking one session and all other sessions each write one sessions event", async () => {
    const second = (await fx.staffA.signIn()).client;
    await fx.staffA.signIn(); // a third device
    const sessions = ok(await second.rpc("list_my_sessions")) as { id: string; is_current: boolean }[];
    const other = sessions.find((s) => !s.is_current)!;
    const who = { staff: fx.staffA.id };
    await expectEvents(() => second.rpc("revoke_my_session", { p_session_id: other.id }).then(ok), [
      { log: "tenant", event: "session.revoked", tenantId: fx.tenantA.id, category: "sessions", actor: who, where: (r) => (r.metadata as { scope?: string }).scope === "single" },
    ]);
    await expectEvents(() => second.rpc("revoke_my_other_sessions", { p_reason: "user_all_others" }).then(ok), [
      { log: "tenant", event: "session.revoked", tenantId: fx.tenantA.id, category: "sessions", actor: who, where: (r) => (r.metadata as { scope?: string }).scope === "others" },
    ]);
  });

  it("recovery issue and completion", async () => {
    const raw = token();
    await expectEvents(async () => {
      expect(ok(await adminClient().rpc("svc_issue_recovery", {
        p_staff_id: inviteeStaffId, p_origin: "self_service", p_actor_staff_id: null as never, p_actor_platform_admin_id: null as never, p_token_hash: hashToken(raw),
      }))).toBe(true);
    }, [{ log: "tenant", event: "password.reset_initiated", tenantId: fx.tenantA.id, category: "staff", actor: "system" }]);
    const begun = ok(await adminClient().rpc("svc_begin_recovery_redemption", { p_token_hash: hashToken(raw) })) as { requestId: string };
    await expectEvents(() => adminClient().rpc("svc_complete_recovery_redemption", { p_request_id: begun.requestId }).then(ok), [
      { log: "tenant", event: "password.reset_completed", tenantId: fx.tenantA.id, category: "staff", actor: { staff: inviteeStaffId } },
    ]);
  });
});

describe("platform administration", () => {
  it("platform-admin invitation and acceptance", async () => {
    const email = `invited-admin-${tag}@platform.example.test`;
    const raw = token();
    await expectEvents(() => platform.rpc("platform_invite_admin", { p_email: email, p_capabilities: ["platform_audit.view"], p_token_hash: hashToken(raw) }).then(ok), [
      { log: "platform", event: "platform_admin.invited", actor: { platformAdmin: fx.platformAdminId } },
    ]);
    const { data: user, error } = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    fx.trackUser(user.user.id);
    await expectEvents(async () => {
      expect(ok(await adminClient().rpc("svc_redeem_platform_invitation", { p_token_hash: hashToken(raw), p_auth_user_id: user.user.id }))).toBe(true);
    }, [{ log: "platform", event: "platform_admin.invitation_accepted", actor: { platformAdmin: user.user.id } }]);
  });

  it("the one-time bootstrap left exactly one platform event, without secrets", async () => {
    const rows = await sql<{ metadata: unknown; actor_operator_ref: string | null }>(
      `select metadata, actor_operator_ref from public.platform_audit_events where event = 'platform_admin.bootstrapped'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_operator_ref).toBeTruthy();
    expect(JSON.stringify(rows)).not.toMatch(/password|token|secret/i);
  });
});

describe("reads", () => {
  it("plain protected reads produce no audit, security or platform event", async () => {
    staff = (await fx.staffA.signIn()).client; // the sessions test revoked the earlier device
    const reads = [
      staff.rpc("my_effective_permissions"), staff.rpc("list_my_sessions"), staff.rpc("get_my_preferences"), staff.rpc("list_staff"),
      manager.rpc("list_staff"), manager.rpc("list_roles"), manager.rpc("list_pending_invitations"), manager.rpc("get_staff", { p_staff_id: fx.staffA.id }),
      manager.rpc("list_tenant_audit", {}), manager.rpc("get_tenant_audit_event", { p_id: Number(written.find((r) => r.log === "tenant" && r.tenant_id === fx.tenantA.id)!.id) }),
      manager.rpc("list_security_events", {}), platform.rpc("platform_list_tenants"), platform.rpc("platform_get_tenant", { p_tenant_id: fx.tenantA.id }),
      platform.rpc("platform_list_audit", {}),
    ];
    await expectEvents(async () => {
      for (const r of await Promise.all(reads)) expect(r.error).toBeNull();
    }, []);
  });
});

describe("event safety", () => {
  it("no event written by this suite holds a token, password, JWT or secret-like key", () => {
    expect(written.length).toBeGreaterThan(20);
    const serialized = JSON.stringify(written);
    for (const s of secrets) expect(serialized).not.toContain(s);
    for (const s of secrets) expect(serialized).not.toContain(hashToken(s)); // not even the stored hashes
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // no JWT
    const keys = (v: unknown): string[] =>
      v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : [];
    for (const r of written) expect(keys(r.metadata).filter((k) => /password|token|secret|key|otp/i.test(k))).toEqual([]);
  });
});
