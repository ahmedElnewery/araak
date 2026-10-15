/** Stable error codes the database raises (and the localized messages in `admin.errors`). */
export const ERROR_CODES = [
  "name_required", "subdomain_invalid", "subdomain_reserved", "subdomain_taken", "email_invalid", "email_unavailable",
  "last_active_manager", "staff_not_found", "staff_not_eligible", "already_manager", "not_a_manager",
  "capabilities_invalid", "capabilities_exceed_inviter", "tenant_not_found", "tenant_unavailable",
  "password_policy", "password_mismatch", "not_authorized", "confirmation_required", "recovery_rate_limited",
  "name_invalid", "logo_type", "logo_mismatch", "logo_too_large", "logo_corrupt", "logo_dimensions", "logo_invalid", "generic",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class RpcError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = "RpcError";
  }
}

/** Maps a database error to a stable, non-sensitive code. Unknown errors become `generic` (never echoed). */
export function toErrorCode(error: { message: string; code?: string }): ErrorCode {
  if (error.code === "42501") return "not_authorized";
  return (ERROR_CODES as readonly string[]).includes(error.message) ? (error.message as ErrorCode) : "generic";
}

export function codeOf(e: unknown): ErrorCode {
  return e instanceof RpcError ? e.code : "generic";
}
