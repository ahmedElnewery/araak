import { randomUUID } from "node:crypto";
import { adminClient, deviceClient } from "./clients";
import { sql } from "./db";

export const PASSWORD = "Fixture-Pass-1234";

export type Tenant = { id: string; subdomain: string };
export type Staff = {
  id: string; tenantId: string; userId: string; email: string; username: string;
  /** Signs in on a fresh simulated device and registers the session like the apps do. */
  signIn(): Promise<{ client: ReturnType<typeof deviceClient>; sessionId: string }>;
};
export type TwoTenantFixture = {
  tenantA: Tenant; tenantB: Tenant; platformAdminId: string;
  managerA: Staff; staffA: Staff; managerB: Staff; staffB: Staff;
  roleA: string; roleB: string;
  /** Registers an Auth user created inside a test so teardown removes it (and any staff row it gained). */
  trackUser(userId: string): void;
  /** Registers a tenant created inside a test (e.g. through platform_create_tenant) so teardown removes it. */
  trackTenant(tenantId: string): void;
  teardown(): Promise<void>;
};

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Two disjoint tenants on the Development project with one manager and one ordinary staff member each. */
export async function createTwoTenantFixture(): Promise<TwoTenantFixture> {
  const admin = adminClient();
  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const tenantIds: string[] = [];

  async function mkUser(email: string): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userIds.push(data.user.id);
    return data.user.id;
  }
  async function mkTenant(label: string): Promise<Tenant> {
    const subdomain = `fx-${label}-${tag}`;
    const [row] = await sql<{ id: string }>(`insert into public.tenants (display_name, subdomain) values (${q(`Fixture ${label} ${tag}`)}, ${q(subdomain)}) returning id`);
    tenantIds.push(row!.id);
    return { id: row!.id, subdomain };
  }
  async function mkStaff(tenant: Tenant, username: string): Promise<Staff> {
    const email = `${username}-${tag}@${tenant.subdomain}.example.test`;
    const userId = await mkUser(email);
    const [row] = await sql<{ id: string }>(
      `insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, activated_at)
       values (${q(tenant.id)}, ${q(userId)}, ${q(email)}, ${q(email.toLowerCase())}, ${q(username)}, now()) returning id`);
    const staff: Staff = {
      id: row!.id, tenantId: tenant.id, userId, email, username,
      async signIn() {
        const client = deviceClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
        if (error || !data.session) throw error ?? new Error("sign-in failed");
        const sessionId = JSON.parse(Buffer.from(data.session.access_token.split(".")[1]!, "base64url").toString()).session_id as string;
        await sql(`insert into public.session_registry (provider_session_id, auth_user_id, tenant_id, staff_id, verified_activity_at)
                   values (${q(sessionId)}, ${q(userId)}, ${q(tenant.id)}, ${q(row!.id)}, now())`);
        return { client, sessionId };
      },
    };
    return staff;
  }

  const platformAdminId = await mkUser(`root-${tag}@platform.example.test`);
  await sql(`insert into public.platform_admins (auth_user_id, capabilities, created_via)
             values (${q(platformAdminId)}, '{tenants.manage,tenants.managers.manage}', 'bootstrap')`);
  const tenantA = await mkTenant("a");
  const tenantB = await mkTenant("b");
  const managerA = await mkStaff(tenantA, "managera");
  const staffA = await mkStaff(tenantA, "stafa");
  const managerB = await mkStaff(tenantB, "managerb");
  const staffB = await mkStaff(tenantB, "stafb");
  for (const m of [managerA, managerB]) {
    await sql(`insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
               values (${q(m.tenantId)}, ${q(m.id)}, ${q(platformAdminId)})`);
  }
  const [ra] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values (${q(tenantA.id)}, 'Viewers') returning id`);
  const [rb] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values (${q(tenantB.id)}, 'Viewers') returning id`);
  await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key) values
    (${q(tenantA.id)}, ${q(ra!.id)}, 'staff.view'), (${q(tenantB.id)}, ${q(rb!.id)}, 'staff.view');
    insert into public.staff_roles (tenant_id, staff_id, role_id) values
    (${q(tenantA.id)}, ${q(staffA.id)}, ${q(ra!.id)}), (${q(tenantB.id)}, ${q(staffB.id)}, ${q(rb!.id)})`);

  return {
    tenantA, tenantB, platformAdminId, managerA, staffA, managerB, staffB, roleA: ra!.id, roleB: rb!.id,
    trackUser(userId) {
      userIds.push(userId);
    },
    trackTenant(tenantId) {
      tenantIds.push(tenantId);
    },
    async teardown() {
      const ids = tenantIds.map(q).join(",");
      const users = userIds.map(q).join(",");
      // Audit tables are append-only; fixture rows are removed through the operator purge flag, in this one transaction.
      await sql(`
        set local app.retention_purge = 'on';
        delete from public.tenant_audit_events where tenant_id in (${ids});
        delete from public.tenant_security_events where tenant_id in (${ids});
        delete from public.platform_audit_events where actor_platform_admin_id in (${users});
        delete from public.recovery_requests where tenant_id in (${ids});
        delete from public.password_confirmations where actor_auth_user_id in (${users});
        delete from private.auth_attempts where tenant_id in (${ids});
        delete from public.staff_invitation_links where tenant_id in (${ids});
        delete from public.staff_invitation_roles where tenant_id in (${ids});
        delete from public.staff_invitations where tenant_id in (${ids});
        delete from public.email_reservations where tenant_id in (${ids});
        delete from public.staff_roles where tenant_id in (${ids});
        delete from public.permission_grants where tenant_id in (${ids});
        delete from public.roles where tenant_id in (${ids});
        delete from public.tenant_manager_grants where tenant_id in (${ids});
        delete from public.session_registry where auth_user_id in (${users}) or tenant_id in (${ids});
        delete from public.tenant_preferences where tenant_id in (${ids});
        delete from public.tenant_staff where tenant_id in (${ids});
        delete from public.platform_admins where auth_user_id in (${users});
        delete from public.tenants where id in (${ids});`);
      for (const id of userIds) await admin.auth.admin.deleteUser(id);
    },
  };
}
