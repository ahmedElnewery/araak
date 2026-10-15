/** Stable error codes the database raises (localized in `portal.errors`). */
export const ERROR_CODES = [
  "email_invalid", "email_unavailable", "role_not_grantable", "username_invalid", "username_taken", "invitation_invalid",
  "resend_cooldown", "resend_cap_reached", "invitation_not_found", "invitation_not_pending", "confirmation_required",
  "recovery_rate_limited", "cannot_reset_self", "staff_not_found", "staff_not_eligible", "password_policy",
  "password_mismatch", "not_authorized", "invalid_credentials", "name_required", "name_invalid", "logo_type", "logo_mismatch",
  "logo_too_large", "logo_corrupt", "logo_dimensions", "logo_invalid",
  "role_name_conflict", "role_name_invalid", "role_assigned", "role_self_edit", "role_not_found", "privilege_escalation", "grants_invalid",
  "cannot_change_own_roles", "cannot_disable_self", "manager_protected", "last_active_manager", "roles_invalid", "generic",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Maps a database error to a stable, non-sensitive code. Unknown errors become `generic` (never echoed). */
export function toErrorCode(error: { message: string; code?: string }): ErrorCode {
  if (error.code === "42501") return "not_authorized";
  return (ERROR_CODES as readonly string[]).includes(error.message) ? (error.message as ErrorCode) : "generic";
}
