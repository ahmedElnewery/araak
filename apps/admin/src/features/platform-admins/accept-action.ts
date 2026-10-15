"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSupabaseServerClient, getSupabaseAdmin, hashToken, registerSession,
} from "@workspace/auth/server";
import { checkPasswordPolicy } from "@/lib/password-policy";
import { landingPath } from "@/lib/platform-guards";
import type { FormState } from "../form-state";

const token = z.string().min(20).max(200);
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function peekInvitation(rawToken: string): Promise<{ valid: boolean; email: string | null }> {
  const t = token.safeParse(rawToken);
  if (!t.success) return { valid: false, email: null };
  const { data, error } = await getSupabaseAdmin().rpc("svc_peek_platform_invitation", { p_token_hash: hashToken(t.data) });
  const r = data as { valid?: boolean; email?: string | null } | null;
  if (error || !r?.valid) return { valid: false, email: null };
  return { valid: true, email: r.email ?? null };
}

/** peek -> create the Auth user -> redeem (compensating delete on failure, R-01) -> sign in -> register the session. */
export async function acceptInvitationAction(rawToken: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const peek = await peekInvitation(rawToken);
  if (!peek.valid || !peek.email) return { error: "not_authorized" };
  const password = text(formData.get("password"));
  const confirm = text(formData.get("confirmPassword"));
  if (!checkPasswordPolicy(password)) return { fieldErrors: { password: "password_policy" } };
  if (password !== confirm) return { fieldErrors: { confirmPassword: "password_mismatch" } };

  const admin = getSupabaseAdmin();
  // GATE-COLLIDE: an email that belongs to tenant staff can never become a platform admin.
  const { data: staff } = await admin.from("tenant_staff").select("id").eq("email_normalized", peek.email).maybeSingle();
  if (staff) return { error: "not_authorized" };

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email: peek.email, password, email_confirm: true });
  if (createError) return { error: "generic" };
  const { data: redeemed, error: redeemError } = await admin.rpc("svc_redeem_platform_invitation", {
    p_token_hash: hashToken(rawToken), p_auth_user_id: created.user.id,
  });
  if (redeemError || !redeemed) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return { error: "not_authorized" };
  }
  const supabase = await createSupabaseServerClient("admin");
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: peek.email, password });
  if (signInError) redirect("/login");
  try {
    await registerSession({
      supabase,
      owner: { kind: "platform_admin", authUserId: created.user.id },
      userAgent: (await headers()).get("user-agent"),
    });
  } catch {
    // the account exists now: end the unregistered session and let the person sign in normally
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    redirect("/login");
  }
  const { data: row } = await admin.from("platform_admins").select("capabilities").eq("auth_user_id", created.user.id).maybeSingle();
  redirect(landingPath(row?.capabilities ?? []));
}
