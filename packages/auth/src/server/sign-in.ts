import "server-only";
import { recordSecurityEvent } from "./audit";
import { buildThrottleKeys, checkAndRecordAttempt, recordAuthSuccess } from "./throttle";
import { registerSession, revokeSessions } from "./session-registry";
import type { ServerClient } from "./supabase";
import { getSupabaseAdmin } from "./supabase-admin";
import { padFailedSignIn, recordPasswordCheckDuration } from "./timing-pad";

export type TenantSignInInput = {
  tenantId: string;
  identifier: string;
  password: string;
  supabase: ServerClient;
  headers: Pick<Headers, "get">;
  userAgent: string | null;
  hmacKey: string;
  trustedProxyHops: number;
};
/** One failure shape for every cause (FR-014): unknown, wrong password, disabled, other tenant, suspended, throttled. */
export type TenantSignInResult = { ok: true; staffId: string } | { ok: false };

export async function signInTenantStaff(i: TenantSignInInput): Promise<TenantSignInResult> {
  const keys = buildThrottleKeys({
    tenantId: i.tenantId, kind: "sign_in", identifier: i.identifier, headers: i.headers,
    hmacKey: i.hmacKey, trustedProxyHops: i.trustedProxyHops,
  });
  const admin = getSupabaseAdmin();
  const fail = async (reason: "invalid" | "throttled", pad: boolean): Promise<TenantSignInResult> => {
    if (pad) await padFailedSignIn(); // same duration as a real failed password check, without an Auth call
    // hashed identifier only; a logging failure never changes the response
    await recordSecurityEvent({ tenantId: i.tenantId, event: "auth.sign_in_failed", metadata: { identifierHmac: keys.identifierHmac, reason } })
      .catch(() => undefined);
    return { ok: false };
  };

  if (!(await checkAndRecordAttempt(keys))) return fail("throttled", true);
  const { data: resolved } = await admin.rpc("svc_resolve_login_email", { p_tenant_id: i.tenantId, p_identifier: i.identifier });
  const email = resolved; // null for unknown, disabled, other-tenant or suspended
  if (!email) return fail("invalid", true);

  const started = performance.now();
  const { data, error } = await i.supabase.auth.signInWithPassword({ email, password: i.password });
  if (error) {
    // calibrates the padded failure paths; only a real wrong-password check counts (not a rate limit or outage)
    if (error.code === "invalid_credentials") recordPasswordCheckDuration(performance.now() - started);
    return fail("invalid", false);
  }

  const sessionId = (await i.supabase.auth.getClaims()).data?.claims.session_id;
  const endSession = async () => {
    if (typeof sessionId === "string") await revokeSessions({ providerSessionIds: [sessionId] }, "sign_out").catch(() => undefined);
    await i.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  };
  const { data: staff } = await admin.from("tenant_staff").select("id, tenant_id, enabled").eq("auth_user_id", data.user.id).maybeSingle();
  if (!staff || staff.tenant_id !== i.tenantId || !staff.enabled) {
    await endSession(); // a valid identity of another tenant (or an incomplete one) never gets a session here
    return fail("invalid", false);
  }
  try {
    await registerSession({
      supabase: i.supabase, owner: { kind: "staff", authUserId: data.user.id, tenantId: staff.tenant_id, staffId: staff.id },
      userAgent: i.userAgent,
    });
  } catch {
    await endSession();
    return fail("invalid", false);
  }
  await recordAuthSuccess(keys);
  return { ok: true, staffId: staff.id };
}
