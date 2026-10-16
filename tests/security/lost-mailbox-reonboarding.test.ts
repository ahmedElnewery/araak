// T104 / CL-013, CL-014, US2 scenarios 20-22: lost mailbox = disable the old identity, invite a NEW one.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError } from "../../packages/auth/src/errors";
import { getTenantStaffContext } from "../../packages/auth/src/server/context";
import { recordTenantAudit } from "../../packages/auth/src/server/audit";
import { generateToken, hashToken } from "../../packages/auth/src/tokens";
import { adminClient } from "../helpers/clients";
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

describe("lost-mailbox re-onboarding", () => {
  it("disabling the old account denies its sessions; a new invitation creates a fresh identity with no copied roles", async () => {
    const old = await fx.staffA.signIn(); // staffA holds a role in the fixture
    await recordTenantAudit({ tenantId: fx.tenantA.id, actor: { kind: "staff", staffId: fx.staffA.id }, category: "staff", event: "staff.activated", resourceType: "tenant_staff", resourceId: fx.staffA.id });
    const [before] = await sql<Record<string, unknown>>(`select id, auth_user_id, email, email_normalized, username, activated_at from public.tenant_staff where id = '${fx.staffA.id}'`);
    const auditBefore = await sql<{ n: string }>(`select count(*) n from public.tenant_audit_events where actor_staff_id = '${fx.staffA.id}'`);
    expect(Number(auditBefore[0]!.n)).toBeGreaterThan(0);

    await sql(`update public.tenant_staff set enabled = false where id = '${fx.staffA.id}'`);
    await expect(getTenantStaffContext({ id: fx.tenantA.id }, old.client as never)).rejects.toMatchObject({ code: "forbidden" } satisfies Partial<AuthError>);
    const perms = await old.client.rpc("my_effective_permissions");
    expect(perms.error?.code).toBe("42501"); // the database denies the old session too

    // re-inviting the old (disabled) address is refused neutrally
    const manager = await fx.managerA.signIn();
    const again = await manager.client.rpc("invite_staff", { p_email: fx.staffA.email, p_role_ids: [], p_token_hash: hashToken(generateToken()) });
    expect(again.error?.message).toBe("email_unavailable");

    // a NEW address gets a NEW identity; no roles are preselected or copied
    const newEmail = `new-${randomUUID().slice(0, 8)}@example.test`;
    const token = generateToken();
    const inv = await manager.client.rpc("invite_staff", { p_email: newEmail, p_role_ids: [], p_token_hash: hashToken(token) });
    expect(inv.error).toBeNull();
    const { data: created, error } = await adminClient().auth.admin.createUser({ email: newEmail, password: PASSWORD, email_confirm: true });
    expect(error).toBeNull();
    fx.trackUser(created.user!.id);
    const { data: staffId, error: redeemError } = await adminClient().rpc("svc_redeem_staff_invitation", {
      p_token_hash: hashToken(token), p_auth_user_id: created.user!.id, p_username: "Replacement",
      p_first_name: "Re", p_last_name: "Placement",
    });
    expect(redeemError).toBeNull();
    expect(staffId).not.toBe(fx.staffA.id);
    expect(await sql(`select 1 from public.staff_roles where staff_id = '${staffId!}'`)).toHaveLength(0);
    expect(await sql(`select 1 from public.staff_roles where staff_id = '${fx.staffA.id}'`)).toHaveLength(1); // the old row keeps its role

    // the old row, its email and its audit authorship are unchanged
    const [after] = await sql<Record<string, unknown>>(`select id, auth_user_id, email, email_normalized, username, activated_at from public.tenant_staff where id = '${fx.staffA.id}'`);
    expect(after).toEqual(before);
    const auditAfter = await sql<{ n: string }>(`select count(*) n from public.tenant_audit_events where actor_staff_id = '${fx.staffA.id}'`);
    expect(Number(auditAfter[0]!.n)).toBe(Number(auditBefore[0]!.n));
  });
});
