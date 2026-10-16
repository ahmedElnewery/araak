// Approved tenant audit categories and Security Log event types (docs/decisions/audit-events.md, GATE-RBAC).
// The database is authoritative: check constraints accept exactly these values (private.approved_audit_categories()
// and private.approved_security_event_types()), and tests/security/parity.test.ts compares the two lists.

/** Tenant administrative audit categories. `audit_logs.view` grants a non-empty subset; a manager holds all. */
export const AUDIT_CATEGORIES = ["staff", "invitations", "roles", "tenant_settings", "sessions"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Security Log event types (CL-034): failed authentication, unauthorized access and denied privilege escalation. */
export const SECURITY_EVENT_TYPES = [
  "auth.sign_in_failed", "authz.denied", "authz.privilege_escalation_denied", "authz.self_membership_denied",
  "authz.role_self_edit_denied", "session.invalid_reuse",
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

/** Retention from the event time (CL-033, CL-034), enforced daily by private.purge_expired_audit(). */
export const AUDIT_RETENTION_MONTHS = { tenantAudit: 12, securityEvents: 3 } as const;

export function isAuditCategory(value: string): value is AuditCategory {
  return (AUDIT_CATEGORIES as readonly string[]).includes(value);
}

export function isSecurityEventType(value: string): value is SecurityEventType {
  return (SECURITY_EVENT_TYPES as readonly string[]).includes(value);
}
