"use server";

import { revalidatePath } from "next/cache";
import { validateUsername } from "@workspace/auth";
import { requireStaff } from "@/lib/guards";
import { toErrorCode } from "@/lib/rpc-error";
import { field, type FormState } from "../form-state";

/** Live session only; no password step (CL-011). The email is never changed anywhere (CL-012). */
export async function changeUsernameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireStaff();
  const username = field(formData, "username").trim();
  const v = validateUsername(username);
  if (!v.ok) return { fieldErrors: { username: "username_invalid" }, usernameError: v.code };
  const { error } = await ctx.supabase.rpc("change_my_username", { p_username: username });
  if (error) {
    const code = toErrorCode(error);
    return code === "username_taken" || code === "username_invalid" ? { fieldErrors: { username: code } } : { error: code };
  }
  revalidatePath("/account");
  return { ok: true };
}
