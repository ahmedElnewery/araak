// T139 / FR-026, SC-005, security-matrix tests 4-5: privilege escalation through every tenant path.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
let delegate: Awaited<ReturnType<TwoTenantFixture["staffA"]["signIn"]>>["client"];
let manager: Awaited<ReturnType<TwoTenantFixture["managerA"]["signIn"]>>["client"];

beforeAll(async () => {
  fx = await createTwoTenantFixture();
  const [role] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${fx.tenantA.id}', 'Role admins') returning id`);
  await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key) values
      ('${fx.tenantA.id}', '${role!.id}', 'roles.create'), ('${fx.tenantA.id}', '${role!.id}', 'roles.update'), ('${fx.tenantA.id}', '${role!.id}', 'staff.roles.assign');
    insert into public.staff_roles (tenant_id, staff_id, role_id) values ('${fx.tenantA.id}', '${fx.staffA.id}', '${role!.id}')`);
  delegate = (await fx.staffA.signIn()).client;
  manager = (await fx.managerA.signIn()).client;
});
afterAll(async () => {
  await fx?.teardown();
});

const roleCount = async () => Number((await sql<{ n: string }>(`select count(*) n from public.roles where tenant_id = '${fx.tenantA.id}'`))[0]!.n);

describe("grant ceiling", () => {
  it("a delegate granting a key above their ceiling is denied with a security event and no role", async () => {
    const before = await roleCount();
    const r = await delegate.rpc("create_role", { p_name: "Escalate", p_description: null, p_grants: [{ key: "staff.disable", scope: "all" }] });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ ok: false, error: "privilege_escalation" });
    expect(await roleCount()).toBe(before);
    const ev = await sql(`select 1 from public.tenant_security_events where tenant_id = '${fx.tenantA.id}' and event = 'authz.privilege_escalation_denied'`);
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });

  it("a delegate cannot assign a role above their ceiling to another person", async () => {
    const [heavy] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${fx.tenantA.id}', 'Heavy') returning id`);
    await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key) values ('${fx.tenantA.id}', '${heavy!.id}', 'staff.disable')`);
    const r = await delegate.rpc("set_staff_roles", { p_staff_id: fx.managerA.id, p_add: [heavy!.id], p_remove: [] });
    expect(r.data).toMatchObject({ ok: false, error: "role_not_grantable" });
    const n = await sql(`select 1 from public.staff_roles where role_id = '${heavy!.id}'`);
    expect(n).toHaveLength(0);
  });

  it("self-elevation is impossible: a delegate cannot add a role to themselves", async () => {
    const [extra] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${fx.tenantA.id}', 'Extra') returning id`);
    const r = await delegate.rpc("set_staff_roles", { p_staff_id: fx.staffA.id, p_add: [extra!.id], p_remove: [] });
    expect(r.data).toMatchObject({ ok: false, error: "cannot_change_own_roles" });
  });

  it("platform capabilities and manager authority cannot be granted through any tenant path", async () => {
    for (const key of ["platform_admins.invite", "tenants.manage", "tenant.branding.edit", "security_logs.view", "staff.password.reset"]) {
      for (const c of [delegate, manager]) {
        const r = await c.rpc("create_role", { p_name: `P ${key}`, p_description: null, p_grants: [{ key, scope: "all" }] });
        expect(r.data, key).toMatchObject({ ok: false, error: "privilege_escalation" });
      }
    }
    const rows = await sql(`select 1 from public.permission_grants where tenant_id = '${fx.tenantA.id}' and permission_key in ('platform_admins.invite','tenants.manage','tenant.branding.edit','security_logs.view')`);
    expect(rows).toHaveLength(0);
  });
});

describe("direct table writes", () => {
  const tables = ["roles", "permission_grants", "staff_roles", "tenant_manager_grants", "tenant_staff"] as const;
  it("INSERT / UPDATE / DELETE with a staff JWT are denied for every RBAC table, manager included", async () => {
    for (const c of [delegate, manager]) {
      for (const tbl of tables) {
        const ins = await c.from(tbl).insert({ tenant_id: fx.tenantA.id });
        expect(ins.error, `insert ${tbl}`).not.toBeNull();
        const upd = await c.from(tbl).update({ tenant_id: fx.tenantA.id }).eq("tenant_id", fx.tenantA.id);
        expect(upd.error, `update ${tbl}`).not.toBeNull();
        const del = await c.from(tbl).delete().eq("tenant_id", fx.tenantA.id);
        expect(del.error, `delete ${tbl}`).not.toBeNull();
      }
    }
    const [m] = await sql<{ n: string }>(`select count(*) n from public.tenant_manager_grants where tenant_id = '${fx.tenantA.id}' and revoked_at is null`);
    expect(Number(m!.n)).toBe(1);
  });
});

describe("platform RPCs", () => {
  it("a tenant JWT cannot call platform RPCs", async () => {
    for (const c of [delegate, manager]) {
      const calls = [
        c.rpc("platform_grant_tenant_manager", { p_tenant_id: fx.tenantA.id, p_staff_id: fx.staffA.id }),
        c.rpc("platform_revoke_tenant_manager", { p_tenant_id: fx.tenantA.id, p_staff_id: fx.managerA.id }),
        c.rpc("platform_invite_tenant_manager", { p_tenant_id: fx.tenantA.id, p_email: "x@y.test", p_token_hash: "h" }),
      ];
      for (const r of await Promise.all(calls)) expect(r.error).not.toBeNull();
    }
    const [m] = await sql<{ n: string }>(`select count(*) n from public.tenant_manager_grants where tenant_id = '${fx.tenantA.id}' and revoked_at is null`);
    expect(Number(m!.n)).toBe(1);
  });

  it("another tenant's role and staff ids are unreachable", async () => {
    const r1 = await manager.rpc("archive_role", { p_role_id: fx.roleB });
    expect(r1.error?.message).toContain("role_not_found");
    const r2 = await manager.rpc("disable_staff", { p_staff_id: fx.staffB.id });
    expect(r2.error?.message).toContain("staff_not_found");
    const [row] = await sql<{ enabled: boolean }>(`select enabled from public.tenant_staff where id = '${fx.staffB.id}'`);
    expect(row!.enabled).toBe(true);
  });
});
