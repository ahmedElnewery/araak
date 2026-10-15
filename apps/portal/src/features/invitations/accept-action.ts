"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkPasswordPolicy, normalizeEmail, validateUsername } from "@workspace/auth";
import { createSupabaseServerClient, getSupabaseAdmin, hashToken, registerSession } from "@workspace/auth/server";
import { requireTenant } from "@/lib/tenant-context";
import { toErrorCode } from "@/lib/rpc-error";
import type { FormState } from "../form-state";

const token = z.string().min(20).max(200);
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** Valid only for THIS host's tenant; anything else is the same neutral "not valid" (no tenant is disclosed). */
export async function peekInvitation(rawToken: string): Promise<{ valid: boolean; email: string | null }> {
  const tenant = await requireTenant();
  const t = token.safeParse(rawToken);
  if (!t.success) return { valid: false, email: null };
  const { data, error } = await getSupabaseAdmin().rpc("svc_peek_staff_invitation", { p_token_hash: hashToken(t.data) });
  const r = data as { valid?: boolean; tenantId?: string | null; email?: string | null } | null;
  if (error || !r?.valid || r.tenantId !== tenant.id) return { valid: false, email: null };
  return { valid: true, email: r.email ?? null };
}

/**
 * peek (host tenant) -> validate -> create the Auth user -> redeem (compensating delete on failure, R-01)
 * -> sign in -> register the session. There is no public registration route (FR-009, FR-016).
 */
export async function acceptInvitationAction(rawToken: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const tenant = await requireTenant();
  const peek = await peekInvitation(rawToken);
  if (!peek.valid || !peek.email) return { error: "invitation_invalid" };

  const username = text(formData.get("username")).trim();
  const password = text(formData.get("password"));
  const confirm = text(formData.get("confirmPassword"));
  const u = validateUsername(username);
  if (!u.ok) return { fieldErrors: { username: "username_invalid" }, usernameError: u.code };
  if (!checkPasswordPolicy(password)) return { fieldErrors: { password: "password_policy" } };
  if (password !== confirm) return { fieldErrors: { confirmPassword: "password_mismatch" } };

  const admin = getSupabaseAdmin();
  const email = normalizeEmail(peek.email);
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) return { error: "invitation_invalid" };

  const { data: staffId, error: redeemError } = await admin.rpc("svc_redeem_staff_invitation", {
    p_token_hash: hashToken(rawToken), p_auth_user_id: created.user.id, p_username: username,
  });
  if (redeemError || !staffId) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    const code = redeemError ? toErrorCode(redeemError) : "generic";
    if (code === "username_taken" || code === "username_invalid") return { fieldErrors: { username: code } };
    return { error: "invitation_invalid" };
  }

  const supabase = await createSupabaseServerClient("portal");
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect("/login");
  await registerSession({
    supabase,
    owner: { kind: "staff", authUserId: created.user.id, tenantId: tenant.id, staffId },
    userAgent: (await headers()).get("user-agent"),
  });
  redirect("/");
}
