import type { UsernameError } from "@workspace/auth";
import type { ErrorCode } from "@/lib/rpc-error";

/** Result of a server action rendered by `useActionState` forms. Codes only: the client localizes them. */
export type FormState = {
  ok?: boolean;
  error?: ErrorCode;
  fieldErrors?: Partial<Record<string, ErrorCode>>;
  /** Which username rule failed, so the form can show the matching localized rule. */
  usernameError?: UsernameError;
  notice?: "invitation_not_delivered" | "reset_not_delivered";
};

export const initialFormState: FormState = {};

/** A text field of a submitted form, or "" when absent or not text. */
export const field = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};
