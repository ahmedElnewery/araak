// Typed mirror of the permission_catalog seed (docs/decisions/permission-catalog.md, PENDING OWNER APPROVAL).
// The database is authoritative; tests/security/catalog-parity.test.ts compares this file with the live seed.

export const RECORD_SCOPES = ["all", "own", "assigned"] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];

export const AUDIT_CATEGORIES = ["staff", "invitations", "roles", "tenant_settings", "sessions"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const TENANT_GRANTABLE_KEYS = [
  "staff.view", "staff.invite", "staff.disable", "staff.enable", "staff.roles.assign",
  "roles.view", "roles.create", "roles.update", "roles.archive", "roles.restore", "audit_logs.view",
] as const;
export type PermissionKey = (typeof TENANT_GRANTABLE_KEYS)[number];

/** Held by an active tenant manager only; never representable as a role grant. */
export const MANAGER_ONLY_KEYS = [
  "tenant.branding.edit", "security_logs.view", "staff.invitation.resend", "staff.password.reset",
] as const;
export type ManagerOnlyKey = (typeof MANAGER_ONLY_KEYS)[number];

/** Every grantable key currently supports only scope `all`. */
export const SUPPORTED_SCOPES: Record<PermissionKey, readonly RecordScope[]> = Object.fromEntries(
  TENANT_GRANTABLE_KEYS.map((k) => [k, ["all"] as const]),
) as unknown as Record<PermissionKey, readonly RecordScope[]>;

export const PLATFORM_CAPABILITIES = [
  "tenants.manage", "tenants.managers.manage", "tenants.staff.manage", "platform_admins.invite", "platform_audit.view",
] as const;
export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

export function isTenantGrantable(key: string): key is PermissionKey {
  return (TENANT_GRANTABLE_KEYS as readonly string[]).includes(key);
}
