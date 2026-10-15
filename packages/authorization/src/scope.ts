import type { RecordScope } from "./catalog";
import type { EffectivePermissions } from "./evaluate";
import { isTenantGrantable } from "./catalog";

export type RecordRef = { tenantId: string; ownerStaffId?: string | null; assigneeStaffIds?: readonly string[] | null };
export type ScopeActor = { tenantId: string; staffId: string };

/**
 * Pure mirror of private.has_permission_for_record (FR-028): same tenant, and the key is held with scope `all`, or
 * `own` for a record the actor owns, or `assigned` for a record the actor is assigned to. `own` and `assigned`
 * never imply `all`. The SQL function is authoritative; use this only for UI hints and early checks.
 */
export function scopeAllows(perms: EffectivePermissions, actor: ScopeActor, key: string, record: RecordRef): boolean {
  if (record.tenantId !== actor.tenantId) return false;
  if (perms.isManager && isTenantGrantable(key)) return true;
  const held = (scope: RecordScope) => perms.permissions.some((g) => g.key === key && (g.scope === "all" || g.scope === scope));
  if (perms.permissions.some((g) => g.key === key && g.scope === "all")) return true;
  if (record.ownerStaffId === actor.staffId && held("own")) return true;
  if ((record.assigneeStaffIds ?? []).includes(actor.staffId) && held("assigned")) return true;
  return false;
}
