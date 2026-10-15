"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSupabaseServerClient, getSupabaseAdmin, recordPlatformAudit, registerSession, revokeSessions,
} from "@workspace/auth/server";
import { normalizeEmail } from "@workspace/auth";

export type SignInState = { error?: "invalid" };

const schema = z.object({ email: z.string().trim().min(3).max(320), password: z.string().min(1).max(256) });

/** One neutral failure for every cause: wrong password, unknown email, or an account that is not a platform admin. */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createSupabaseServerClient("admin");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(parsed.data.email),
    password: parsed.data.password,
  });
  if (error) {
    await recordPlatformAudit({ event: "auth.login_failed", metadata: { reason: "credentials" } }).catch(() => undefined);
    return { error: "invalid" };
  }
  const { data: row } = await getSupabaseAdmin()
    .from("platform_admins")
    .select("enabled")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  const { data: claims } = await supabase.auth.getClaims();
  const sessionId = claims?.claims.session_id;
  if (!row?.enabled) {
    // Not an (enabled) platform admin: end the provider session just created and report the same neutral failure.
    if (typeof sessionId === "string") await revokeSessions({ providerSessionIds: [sessionId] }, "sign_out").catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await recordPlatformAudit({ event: "auth.login_failed", metadata: { reason: "not_platform_admin" } }).catch(() => undefined);
    return { error: "invalid" };
  }
  await registerSession({
    supabase,
    owner: { kind: "platform_admin", authUserId: data.user.id },
    userAgent: (await headers()).get("user-agent"),
  });
  redirect("/tenants");
}
