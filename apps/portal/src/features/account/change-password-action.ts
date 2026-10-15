"use server";

import { redirect } from "next/navigation";
import { checkPasswordPolicy } from "@workspace/auth";
import { changeOwnPassword } from "@workspace/auth/server";
import { requireStaff } from "@/lib/guards";
import { field, type FormState } from "../form-state";

/** Current password required; success revokes all other sessions and revalidates this one (FR-021). */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireStaff();
  const current = field(formData, "currentPassword");
  const next = field(formData, "newPassword");
  const confirm = field(formData, "confirmPassword");
  if (!current) return { fieldErrors: { currentPassword: "invalid_credentials" } };
  if (!checkPasswordPolicy(next)) return { fieldErrors: { newPassword: "password_policy" } };
  if (next !== confirm) return { fieldErrors: { confirmPassword: "password_mismatch" } };
  const r = await changeOwnPassword(ctx, { currentPassword: current, newPassword: next });
  if (!r.ok) return r.reason === "wrong_current" ? { fieldErrors: { currentPassword: "invalid_credentials" } } : { error: "generic" };
  if (r.signedOut) redirect("/login");
  return { ok: true };
}
