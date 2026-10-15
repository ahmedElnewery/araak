// T075 / CL-024, CL-026, FR-022: manager demotion under concurrency and its session consequences.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, decodeJwt, deviceClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
let platform: ReturnType<typeof deviceClient>;

beforeAll(async () => {
  fx = await createTwoTenantFixture();
  const { data } = await adminClient().auth.admin.getUserById(fx.platformAdminId);
  platform = deviceClient();
  const { data: s, error } = await platform.auth.signInWithPassword({ email: data.user!.email!, password: PASSWORD });
  if (error || !s.session) throw error ?? new Error("platform sign-in failed");
  const sid = decodeJwt(s.session.access_token).session_id as string;
  await sql(`insert into public.session_registry (provider_session_id, auth_user_id, platform_admin_id, verified_activity_at)
             values ('${sid}', '${fx.platformAdminId}', '${fx.platformAdminId}', now())`);
});
afterAll(async () => {
  await fx?.teardown();
});

const revoke = (tenantId: string, staffId: string) => platform.rpc("platform_revoke_tenant_manager", { p_tenant_id: tenantId, p_staff_id: staffId });
const grant = (tenantId: string, staffId: string) => platform.rpc("platform_grant_tenant_manager", { p_tenant_id: tenantId, p_staff_id: staffId });

describe("manager revocation", () => {
  it("two parallel revocations of a tenant's two managers succeed at most once", async () => {
    expect((await grant(fx.tenantA.id, fx.staffA.id)).error).toBeNull(); // A now has two managers
    const [r1, r2] = await Promise.all([revoke(fx.tenantA.id, fx.managerA.id), revoke(fx.tenantA.id, fx.staffA.id)]);
    const ok = [r1, r2].filter((r) => !r.error);
    const failed = [r1, r2].filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error!.message).toContain("last_active_manager");
    const active = await sql(`select 1 from public.tenant_manager_grants where tenant_id = '${fx.tenantA.id}' and revoked_at is null`);
    expect(active).toHaveLength(1);
  });

  it("denies the pre-demotion session, blocks its refresh, and lets the user sign in again with non-manager grants only", async () => {
    // tenant B: promote the ordinary staff member first so the original manager can be demoted
    expect((await grant(fx.tenantB.id, fx.staffB.id)).error).toBeNull();
    const { client: oldClient, sessionId } = await fx.managerB.signIn();
    const before = await oldClient.rpc("my_effective_permissions");
    expect(before.error).toBeNull();
    expect((before.data as { isManager: boolean }).isManager).toBe(true);
    const refreshToken = (await oldClient.auth.getSession()).data.session!.refresh_token;

    expect((await revoke(fx.tenantB.id, fx.managerB.id)).error).toBeNull();

    // a request racing on the pre-demotion session is denied (the access token is still cryptographically valid)
    const after = await oldClient.rpc("my_effective_permissions");
    expect(after.error).not.toBeNull();
    const reg = await sql<{ revoked_reason: string | null }>(`select revoked_reason from public.session_registry where provider_session_id = '${sessionId}'`);
    expect(reg[0]!.revoked_reason).toBe("manager_demoted");

    // the old refresh token cannot be refreshed
    const refreshed = await deviceClient().auth.refreshSession({ refresh_token: refreshToken });
    expect(refreshed.data.session).toBeNull();
    expect(refreshed.error).not.toBeNull();

    // the demoted user signs in again and holds only non-manager grants
    const { client: fresh } = await fx.managerB.signIn();
    const again = await fresh.rpc("my_effective_permissions");
    expect(again.error).toBeNull();
    expect((again.data as { isManager: boolean }).isManager).toBe(false);
  });
});
