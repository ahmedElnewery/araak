export type UsernameError = "length" | "charset" | "placement";
export type UsernameResult = { ok: true } | { ok: false; code: UsernameError };

/** Equivalent to `^[A-Za-z]+(?:[._][A-Za-z]+)*$` with 3 to 30 characters (FR-010); the database enforces the same rule. */
export function validateUsername(value: string): UsernameResult {
  if (value.length < 3 || value.length > 30) return { ok: false, code: "length" };
  if (!/^[A-Za-z._]+$/.test(value)) return { ok: false, code: "charset" };
  if (!/^[A-Za-z]+(?:[._][A-Za-z]+)*$/.test(value)) return { ok: false, code: "placement" };
  return { ok: true };
}

/** Dictionary key under `username.*` for a validation code. */
export function usernameErrorKey(code: UsernameError): "errorLength" | "errorCharset" | "errorPlacement" {
  return code === "length" ? "errorLength" : code === "charset" ? "errorCharset" : "errorPlacement";
}
