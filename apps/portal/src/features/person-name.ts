import { validatePersonName } from "@workspace/auth";
import type { ErrorCode } from "@/lib/rpc-error";
import { field, type FormState } from "./form-state";

type FieldErrors = NonNullable<FormState["fieldErrors"]>;

/** The `firstName` and `lastName` fields of a submitted form, cleaned, or the field error of each invalid one. */
export function readPersonName(formData: FormData):
  | { ok: true; firstName: string; lastName: string }
  | { ok: false; fieldErrors: FieldErrors } {
  const first = validatePersonName(field(formData, "firstName"));
  const last = validatePersonName(field(formData, "lastName"));
  if (first.ok && last.ok) return { ok: true, firstName: first.value, lastName: last.value };
  const fieldErrors: FieldErrors = {};
  if (!first.ok) fieldErrors.firstName = first.code === "required" ? "first_name_required" : "first_name_invalid";
  if (!last.ok) fieldErrors.lastName = last.code === "required" ? "last_name_required" : "last_name_invalid";
  return { ok: false, fieldErrors };
}

/** A name refused by the database, as the error of the matching field; null for any other code. */
export function personNameFieldError(code: ErrorCode): FieldErrors | null {
  if (code === "first_name_invalid") return { firstName: code };
  if (code === "last_name_invalid") return { lastName: code };
  return null;
}
