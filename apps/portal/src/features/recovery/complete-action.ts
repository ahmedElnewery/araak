"use server";

import { checkPasswordPolicy } from "@workspace/auth";
import { peekRecovery, redeemRecovery } from "@workspace/auth/server";
import { requireTenant } from "@/lib/tenant-context";
import { field } from "../form-state";

export type RecoveryCompleteState = {
  done?: true;
  error?: "invalid" | "failed";
  fieldErrors?: { password?: "password_policy"; confirmPassword?: "password_mismatch" };
};

/** Non-consuming: lets the page show a neutral "link unavailable" message before any form. */
export async function isRecoveryLinkValid(rawToken: string): Promise<boolean> {
  const tenant = await requireTenant();
  if (rawToken.length < 20 || rawToken.length > 200) return false;
  const peek = await peekRecovery(rawToken);
  return peek.valid && peek.tenantId === tenant.id;
}

export async function completeRecoveryAction(rawToken: string, _prev: RecoveryCompleteState, formData: FormData): Promise<RecoveryCompleteState> {
  const tenant = await requireTenant();
  const password = field(formData, "password");
  const confirm = field(formData, "confirmPassword");
  // validated BEFORE the link is consumed, so a typo never burns it
  if (!checkPasswordPolicy(password)) return { fieldErrors: { password: "password_policy" } };
  if (password !== confirm) return { fieldErrors: { confirmPassword: "password_mismatch" } };
  const r = await redeemRecovery({ rawToken, newPassword: password, hostTenantId: tenant.id });
  return r.ok ? { done: true } : { error: r.reason };
}
