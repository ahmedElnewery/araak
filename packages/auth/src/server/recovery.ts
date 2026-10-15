import "server-only";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@workspace/config/server";
import type { Mailer } from "../email/mailer";
import { renderPasswordReset } from "../email/templates/password-reset";
import type { Locale } from "../email/templates/shared";
import { generateToken, hashToken } from "../tokens";
import { buildRecoveryLink } from "./invitations/link";
import { revokeSessions } from "./session-registry";
import { getSupabaseAdmin } from "./supabase-admin";
import { buildThrottleKeys, checkAndRecordAttempt } from "./throttle";
import { decodeSessionId } from "./session-id";

type AppEnv = "development" | "production" | "test";

export type SelfServiceRecoveryInput = {
  tenant: { id: string; displayName: string; subdomain: string };
  identifier: string;
  headers: Pick<Headers, "get">;
  hmacKey: string;
  trustedProxyHops: number;
  mailer: Mailer;
  locale: Locale;
  appEnv: AppEnv;
  portalBaseDomain: string;
  /** Runs account-dependent work AFTER the response (Next `after`), so timing never reveals whether an account exists. */
  defer: (work: () => Promise<void>) => void;
};

/** Always "succeeds" from the caller's view: the response is identical for known, unknown, disabled and throttled input. */
export async function requestSelfServiceRecovery(i: SelfServiceRecoveryInput): Promise<void> {
  const keys = buildThrottleKeys({
    tenantId: i.tenant.id, kind: "recovery", identifier: i.identifier, headers: i.headers,
    hmacKey: i.hmacKey, trustedProxyHops: i.trustedProxyHops,
  });
  if (!(await checkAndRecordAttempt(keys))) return;
  i.defer(async () => {
    try {
      const admin = getSupabaseAdmin();
      const { data: resolved } = await admin.rpc("svc_resolve_login_email", { p_tenant_id: i.tenant.id, p_identifier: i.identifier });
      const email = resolved;
      if (!email) return;
      const { data: staff } = await admin.from("tenant_staff").select("id").eq("tenant_id", i.tenant.id)
        .eq("email_normalized", email.trim().toLowerCase()).maybeSingle();
      if (!staff) return;
      const token = generateToken();
      const { data: issued } = await admin.rpc("svc_issue_recovery", {
        p_staff_id: staff.id, p_origin: "self_service", p_actor_staff_id: null as unknown as string,
        p_actor_platform_admin_id: null as unknown as string, p_token_hash: hashToken(token),
      });
      if (issued !== true) return;
      const link = buildRecoveryLink({ appEnv: i.appEnv, subdomain: i.tenant.subdomain, portalBaseDomain: i.portalBaseDomain, token });
      await i.mailer.send({ to: email, ...renderPasswordReset(i.locale, { tenantName: i.tenant.displayName, link, validMinutes: 60 }) });
    } catch {
      // never surfaced: the requester always gets the neutral response
    }
  });
}

/** Mails a reset link for an ALREADY issued assisted reset (manager or platform); the raw token only goes to the employee. */
export async function mailResetLink(args: {
  mailer: Mailer; to: string; locale: Locale; appEnv: AppEnv; portalBaseDomain: string;
  tenant: { displayName: string; subdomain: string }; token: string;
}): Promise<boolean> {
  const link = buildRecoveryLink({ appEnv: args.appEnv, subdomain: args.tenant.subdomain, portalBaseDomain: args.portalBaseDomain, token: args.token });
  try {
    await args.mailer.send({ to: args.to, ...renderPasswordReset(args.locale, { tenantName: args.tenant.displayName, link, validMinutes: 60 }) });
    return true;
  } catch {
    return false;
  }
}

export async function peekRecovery(rawToken: string): Promise<{ valid: boolean; tenantId: string | null }> {
  const { data, error } = await getSupabaseAdmin().rpc("svc_peek_recovery", { p_token_hash: hashToken(rawToken) });
  const r = data as { valid?: boolean; tenantId?: string | null } | null;
  if (error || !r?.valid) return { valid: false, tenantId: null };
  return { valid: true, tenantId: r.tenantId ?? null };
}

export type RedeemRecoveryResult = { ok: true } | { ok: false; reason: "invalid" | "failed" };

/** peek (tenant must be the host's) -> begin (single use) -> set the password -> complete (revokes ALL sessions). */
export async function redeemRecovery(args: { rawToken: string; newPassword: string; hostTenantId: string }): Promise<RedeemRecoveryResult> {
  const admin = getSupabaseAdmin();
  const peek = await peekRecovery(args.rawToken);
  if (!peek.valid || peek.tenantId !== args.hostTenantId) return { ok: false, reason: "invalid" };
  const { data, error } = await admin.rpc("svc_begin_recovery_redemption", { p_token_hash: hashToken(args.rawToken) });
  const begin = data as { requestId: string; authUserId: string; tenantId: string } | null;
  if (error || !begin || begin.tenantId !== args.hostTenantId) return { ok: false, reason: "invalid" };
  const { error: updateError } = await admin.auth.admin.updateUserById(begin.authUserId, { password: args.newPassword });
  if (updateError) {
    await admin.rpc("svc_mark_recovery_failed", { p_request_id: begin.requestId });
    return { ok: false, reason: "failed" };
  }
  const { error: completeError } = await admin.rpc("svc_complete_recovery_redemption", { p_request_id: begin.requestId });
  if (completeError) {
    // the password already changed: old sessions must not survive, and the user must not see an error page for it
    await revokeSessions({ authUserId: begin.authUserId }, "recovery").catch(() => {
      logger.error("recovery.session_revocation_failed", { requestId: begin.requestId });
    });
  }
  return { ok: true };
}

/**
 * Verifies the actor's OWN password with a throwaway, non-persisting client, ends the provider session that check
 * created at once (research.md R-02 item 3), then records the database-timed confirmation (120 s, single use).
 */
export async function confirmOwnPassword(args: { email: string; password: string; authUserId: string }): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await probe.auth.signInWithPassword({ email: args.email, password: args.password });
  if (error) return false;
  // the provider session this check created must never outlive it
  await revokeSessions({ providerSessionIds: [decodeSessionId(data.session.access_token)] }, "sign_out");
  if (data.user.id !== args.authUserId) return false;
  const { error: recordError } = await getSupabaseAdmin().rpc("svc_record_password_confirmation", { p_actor_auth_user_id: args.authUserId });
  return !recordError;
}
