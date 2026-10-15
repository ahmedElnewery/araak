// T138 / CL-027, CL-028, CL-031, FR-008: role and membership races. Every operation serializes on rbac_lock(tenant).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

const t = () => fx.tenantA.id;
type Res = { ok?: boolean; error?: string };
const outcome = (r: { data: unknown; error: { message: string } | null }): string =>
  r.error ? `raised:${r.error.message}` : ((r.data as Res).ok ? "ok" : (r.data as Res).error ?? "denied");

describe("role races", () => {
  it("archive racing a concurrent assignment never leaves an archived role with assignments", async () => {
    const { client } = await fx.managerA.signIn();
    for (let i = 0; i < 6; i++) {
      const [role] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${t()}', 'Race ${i}') returning id`);
      const [a, b] = await Promise.all([
        client.rpc("archive_role", { p_role_id: role!.id }),
        client.rpc("set_staff_roles", { p_staff_id: fx.staffA.id, p_add: [role!.id], p_remove: [] }),
      ]);
      const bad = await sql(`select 1 from public.roles r where r.id = '${role!.id}' and r.archived_at is not null
        and exists (select 1 from public.staff_roles sr where sr.role_id = r.id)`);
      expect(bad, `iteration ${i}: archive=${outcome(a)} assign=${outcome(b)}`).toHaveLength(0);
    }
  });

  it("an archive racing a membership insert from the invitation path is also safe (guard share-locks the role)", async () => {
    const { client } = await fx.managerA.signIn();
    for (let i = 0; i < 4; i++) {
      const [role] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${t()}', 'Guard ${i}') returning id`);
      const [a, b] = await Promise.allSettled([
        client.rpc("archive_role", { p_role_id: role!.id }),
        sql(`insert into public.staff_roles (tenant_id, staff_id, role_id) values ('${t()}', '${fx.staffA.id}', '${role!.id}')`),
      ]);
      expect(a.status).toBe("fulfilled");
      const bad = await sql(`select 1 from public.roles r where r.id = '${role!.id}' and r.archived_at is not null
        and exists (select 1 from public.staff_roles sr where sr.role_id = r.id)`);
      expect(bad, `iteration ${i}: insert=${b.status}`).toHaveLength(0);
    }
  });

  it("a role edit racing the editor's own assignment to that role is denied or ordered before it", async () => {
    const [editorRole] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${t()}', 'Editors') returning id`);
    await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key) values ('${t()}', '${editorRole!.id}', 'roles.update');
               insert into public.staff_roles (tenant_id, staff_id, role_id) values ('${t()}', '${fx.staffA.id}', '${editorRole!.id}')`);
    const { client: editor } = await fx.staffA.signIn();
    const { client: manager } = await fx.managerA.signIn();
    for (let i = 0; i < 5; i++) {
      const [target] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${t()}', 'Target ${i}') returning id`);
      await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key) values ('${t()}', '${target!.id}', 'roles.update')`);
      // assigning staffA (the editor) to the target is only possible by someone else: here, the manager
      const [upd, asg] = await Promise.all([
        editor.rpc("update_role", { p_role_id: target!.id, p_name: `Renamed ${i}`, p_description: null, p_grants: [{ key: "roles.update", scope: "all" }] }),
        manager.rpc("set_staff_roles", { p_staff_id: fx.staffA.id, p_add: [target!.id], p_remove: [] }),
      ]);
      const holds = await sql<{ n: string }>(`select count(*) n from public.staff_roles where staff_id = '${fx.staffA.id}' and role_id = '${target!.id}'`);
      expect(outcome(asg), `iteration ${i}`).toBe("ok");
      expect(Number(holds[0]!.n)).toBe(1);
      if (outcome(upd) === "ok") {
        // the edit happened strictly before the assignment (rbac_lock order), never after the editor held the role
        const [ev] = await sql<{ upd: string; add: string }>(`select
          (select max(id) from public.tenant_audit_events where tenant_id = '${t()}' and event = 'role.updated' and resource_id = '${target!.id}') upd,
          (select max(id) from public.tenant_audit_events where tenant_id = '${t()}' and event = 'staff.role_added' and metadata->>'roleId' = '${target!.id}') add`);
        expect(Number(ev!.upd)).toBeLessThan(Number(ev!.add));
      } else {
        expect(outcome(upd)).toBe("role_self_edit");
      }
      // after the assignment the edit is always denied
      const later = await editor.rpc("update_role", { p_role_id: target!.id, p_name: "Later", p_description: null, p_grants: [{ key: "roles.update", scope: "all" }] });
      expect(outcome(later)).toBe("role_self_edit");
    }
  });

  it("restore racing the creation of a same-name role leaves exactly one active role", async () => {
    const { client } = await fx.managerA.signIn();
    for (let i = 0; i < 4; i++) {
      const name = `Twin ${i}`;
      const [old] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name, archived_at) values ('${t()}', '${name}', now()) returning id`);
      const [restore, create] = await Promise.all([
        client.rpc("restore_role", { p_role_id: old!.id }),
        client.rpc("create_role", { p_name: name, p_description: null, p_grants: [] }),
      ]);
      const [row] = await sql<{ n: string }>(`select count(*) n from public.roles where tenant_id = '${t()}' and name_normalized = lower('${name}') and archived_at is null`);
      expect(Number(row!.n), `iteration ${i}: restore=${outcome(restore)} create=${outcome(create)}`).toBe(1);
      expect([outcome(restore), outcome(create)]).toContain("role_name_conflict");
    }
  });

  it("concurrent disables of the last two managers leave at least one active manager", async () => {
    await sql(`insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin) values ('${t()}', '${fx.staffA.id}', '${fx.platformAdminId}')`);
    const { client: c1 } = await fx.managerA.signIn();
    const { client: c2 } = await fx.staffA.signIn();
    const [r1, r2] = await Promise.all([
      c1.rpc("disable_staff", { p_staff_id: fx.staffA.id }),
      c2.rpc("disable_staff", { p_staff_id: fx.managerA.id }),
    ]);
    const [row] = await sql<{ n: string }>(`select count(*) n from public.tenant_manager_grants g join public.tenant_staff s on s.id = g.staff_id
      where g.tenant_id = '${t()}' and g.revoked_at is null and s.enabled`);
    expect(Number(row!.n), `r1=${outcome(r1)} r2=${outcome(r2)}`).toBeGreaterThanOrEqual(1);
  });
});
