import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

export type AuditCategory = "staff" | "invitations" | "roles" | "tenant_settings" | "sessions";
export type TenantAuditEvent =
  | "staff.disabled" | "staff.enabled" | "staff.activated" | "invitation.issued" | "invitation.delivery_failed"
  | "invitation.resent" | "role.created" | "role.updated" | "role.archived" | "role.restored" | "role.assigned"
  | "role.unassigned" | "tenant.branding_updated" | "session.revoked" | "password.reset_initiated";
export type SecurityEvent =
  | "auth.login_failed" | "auth.login_throttled" | "authz.denied" | "session.invalid" | "tenant.cross_access_denied";
export type PlatformAuditEvent =
  | "tenant.created" | "tenant.suspended" | "tenant.activated" | "manager.granted" | "manager.revoked"
  | "platform_admin.invited" | "platform_admin.bootstrapped" | "restore.rehearsed" | "authz.denied";

type Meta = Record<string, unknown>;

/** For events that originate outside an RPC (e.g. a failed sign-in). The database strips secret-like keys. */
export async function recordTenantAudit(e: {
  tenantId: string; actor: { kind: "staff"; staffId: string } | { kind: "platform_admin"; id: string } | { kind: "system" };
  category: AuditCategory; event: TenantAuditEvent; resourceType?: string; resourceId?: string; metadata?: Meta;
}) {
  const { error } = await getSupabaseAdmin().rpc("svc_write_tenant_audit", {
    p_tenant_id: e.tenantId,
    p_actor_kind: e.actor.kind,
    p_actor_staff_id: (e.actor.kind === "staff" ? e.actor.staffId : null) as string,
    p_actor_platform_admin_id: (e.actor.kind === "platform_admin" ? e.actor.id : null) as string,
    p_category: e.category,
    p_event: e.event,
    p_resource_type: e.resourceType,
    p_resource_id: e.resourceId,
    p_metadata: (e.metadata ?? {}) as never,
  });
  if (error) throw new Error("audit_write_failed");
}

export async function recordSecurityEvent(e: { tenantId: string; staffId?: string; event: SecurityEvent; metadata?: Meta }) {
  const { error } = await getSupabaseAdmin().rpc("svc_write_security_event", {
    p_tenant_id: e.tenantId,
    p_actor_staff_id: (e.staffId ?? null) as string,
    p_event: e.event,
    p_metadata: (e.metadata ?? {}) as never,
  });
  if (error) throw new Error("security_event_write_failed");
}

export async function recordPlatformAudit(e: { adminId?: string; operatorRef?: string; event: PlatformAuditEvent; metadata?: Meta }) {
  const { error } = await getSupabaseAdmin().rpc("svc_write_platform_audit", {
    p_actor_platform_admin_id: (e.adminId ?? null) as string,
    p_actor_operator_ref: (e.operatorRef ?? null) as string,
    p_event: e.event,
    p_metadata: (e.metadata ?? {}) as never,
  });
  if (error) throw new Error("platform_audit_write_failed");
}
