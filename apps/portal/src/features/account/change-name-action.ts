"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/guards";
import { toErrorCode } from "@/lib/rpc-error";
import type { FormState } from "../form-state";
import { personNameFieldError, readPersonName } from "../person-name";

/** Own first and last name only; a live session is enough, as for the username (CL-011). */
export async function changeNameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireStaff();
  const name = readPersonName(formData);
  if (!name.ok) return { fieldErrors: name.fieldErrors };
  const { error } = await ctx.supabase.rpc("change_my_name", { p_first_name: name.firstName, p_last_name: name.lastName });
  if (error) {
    const code = toErrorCode(error);
    const fieldErrors = personNameFieldError(code);
    return fieldErrors ? { fieldErrors } : { error: code };
  }
  revalidatePath("/", "layout"); // the header and the welcome show the name
  return { ok: true };
}
