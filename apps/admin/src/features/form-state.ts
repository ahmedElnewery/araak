import type { ErrorCode } from "@/lib/rpc-error";

/** Result of a server action rendered by `useActionState` forms. Codes only: the client localizes them. */
export type FormState = {
  ok?: boolean;
  /** Bumped on every submission so the client can react to repeated identical results. */
  n?: number;
  error?: ErrorCode;
  fieldErrors?: Partial<Record<string, ErrorCode>>;
  notice?: "invitation_not_delivered";
};

export const initialFormState: FormState = {};
