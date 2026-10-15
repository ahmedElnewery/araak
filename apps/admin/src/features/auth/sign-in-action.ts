"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  PLATFORM_THROTTLE_SCOPE, buildThrottleKeys, checkAndRecordAttempt, createSupabaseServerClient, getSupabaseAdmin,
  padFailedSignIn, recordAuthSuccess, recordPlatformAudit, registerSession, revokeSessions,
} from "@workspace/auth/server";
import { normalizeEmail } from "@workspace/auth";
import { getServerEnv } from "@workspace/config/server";
import { landingPath } from "@/lib/platform-guards";

export type SignInState = { error?: "invalid" };

const schema = z.object({ email: z.string().trim().min(3).max(320), password: z.string().min(1).max(256) });

/**
 * One neutral failure for every cause: wrong password, unknown email, an account that is not a platform admin, or a
 * throttled attempt (docs/decisions/auth-abuse-controls.md: 5 per identifier and 20 per client IP in 15 minutes).
 */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const env = getServerEnv("admin");
  const requestHeaders = await headers();
  const email = normalizeEmail(parsed.data.email);
  const keys = buildThrottleKeys({
    tenantId: PLATFORM_THROTTLE_SCOPE, kind: "platform_sign_in", identifier: email, headers: requestHeaders,
    hmacKey: env.AUTH_THROTTLE_HMAC_KEY, trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  if (!(await checkAndRecordAttempt(keys))) {
    await padFailedSignIn(); // a throttled attempt costs what a failed password check costs, without an Auth call
    await recordPlatformAudit({ event: "auth.login_throttled", metadata: { identifierHmac: keys.identifierHmac } }).catch(() => undefined);
    return { error: "invalid" };
  }

  const supabase = await createSupabaseServerClient("admin");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    await recordPlatformAudit({ event: "auth.login_failed", metadata: { reason: "credentials" } }).catch(() => undefined);
    return { error: "invalid" };
  }
  const { data: row } = await getSupabaseAdmin()
    .from("platform_admins")
    .select("enabled, capabilities")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  const { data: claims } = await supabase.auth.getClaims();
  const sessionId = claims?.claims.session_id;
  // ends the provider session just created, so a refused sign-in never leaves a live but unregistered session behind
  const endSession = async () => {
    if (typeof sessionId === "string") await revokeSessions({ providerSessionIds: [sessionId] }, "sign_out").catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  };
  if (!row?.enabled) {
    await endSession();
    await recordPlatformAudit({ event: "auth.login_failed", metadata: { reason: "not_platform_admin" } }).catch(() => undefined);
    return { error: "invalid" };
  }
  try {
    await registerSession({
      supabase,
      owner: { kind: "platform_admin", authUserId: data.user.id },
      userAgent: requestHeaders.get("user-agent"),
    });
  } catch {
    await endSession();
    await recordPlatformAudit({ adminId: data.user.id, event: "auth.login_failed", metadata: { reason: "session_registration" } }).catch(() => undefined);
    return { error: "invalid" };
  }
  await recordAuthSuccess(keys);
  redirect(landingPath(row.capabilities));
}
