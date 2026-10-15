import "server-only";
import { createClient } from "@supabase/supabase-js";
import { recordTenantAudit } from "./audit";
import { revokeSessions } from "./session-registry";
import { decodeSessionId } from "./session-id";
import type { TenantStaffContext } from "./context";

/** Verifies the caller's current password on a throwaway client; the provider session it creates never outlives the check. */
async function verifyCurrentPassword(email: string, password: string, authUserId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error) return false;
  await revokeSessions({ providerSessionIds: [decodeSessionId(data.session.access_token)] }, "sign_out");
  return data.user.id === authUserId;
}

export type ChangePasswordResult =
  | { ok: true; signedOut: boolean }
  | { ok: false; reason: "wrong_current" | "failed" };

/**
 * FR-021 / US3 scenario 4. Order: verify current password, set the new one, revoke every OTHER session, then
 * revalidate the current session. If revalidation fails the current session is revoked too (sign in again).
 */
export async function changeOwnPassword(ctx: TenantStaffContext, input: { currentPassword: string; newPassword: string }): Promise<ChangePasswordResult> {
  if (!(await verifyCurrentPassword(ctx.email, input.currentPassword, ctx.authUserId))) return { ok: false, reason: "wrong_current" };
  const { error: updateError } = await ctx.supabase.auth.updateUser({ password: input.newPassword });
  if (updateError) return { ok: false, reason: "failed" };
  const { error: revokeError } = await ctx.supabase.rpc("revoke_my_other_sessions", { p_reason: "password_change" });
  if (revokeError) {
    // The password is already changed but old sessions may survive: close the gap by ending everything but this session.
    await revokeSessions({ authUserId: ctx.authUserId, exceptProviderSessionId: ctx.sessionId }, "password_change").catch(() => undefined);
  }
  await recordTenantAudit({
    tenantId: ctx.tenantId, actor: { kind: "staff", staffId: ctx.staffId }, category: "staff", event: "password.changed",
    resourceType: "tenant_staff", resourceId: ctx.staffId,
  }).catch(() => undefined);
  const { data: refreshed, error: refreshError } = await ctx.supabase.auth.refreshSession();
  if (refreshError || !refreshed.session) {
    await revokeSessions({ providerSessionIds: [ctx.sessionId] }, "password_change").catch(() => undefined);
    await ctx.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { ok: true, signedOut: true };
  }
  return { ok: true, signedOut: false };
}
