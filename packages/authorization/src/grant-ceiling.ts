import { AUDIT_CATEGORIES, SUPPORTED_SCOPES, isTenantGrantable, type AuditCategory, type RecordScope } from "./catalog";
import { auditCategoriesFor, type EffectivePermissions } from "./evaluate";

export type RequestedGrant = { key: string; scope: RecordScope; auditCategories?: AuditCategory[] | null };
export type CeilingResult = { ok: true } | { ok: false; key: string; reason: "not_grantable" | "scope_unsupported" | "audit_categories" | "above_authority" };

/**
 * Pure mirror of private.actor_can_grant (docs/decisions/permission-catalog.md §4). An actor may confer a grant
 * only if they hold the same key with scope `all` or the identical scope, and only audit categories they hold.
 * Active managers may confer any tenant-grantable key. The SQL function is authoritative; this drives UI hints.
 */
export function canGrant(actor: EffectivePermissions, requested: RequestedGrant[]): CeilingResult {
  for (const g of requested) {
    if (!isTenantGrantable(g.key)) return { ok: false, key: g.key, reason: "not_grantable" };
    if (!SUPPORTED_SCOPES[g.key].includes(g.scope)) return { ok: false, key: g.key, reason: "scope_unsupported" };
    if (g.key === "audit_logs.view") {
      const cats = g.auditCategories;
      if (!cats || cats.length === 0 || !cats.every((c) => (AUDIT_CATEGORIES as readonly string[]).includes(c))) {
        return { ok: false, key: g.key, reason: "audit_categories" };
      }
    } else if (g.auditCategories != null) {
      return { ok: false, key: g.key, reason: "audit_categories" };
    }
    if (actor.isManager) continue;
    const held = actor.permissions.some((p) => p.key === g.key && (p.scope === "all" || p.scope === g.scope));
    if (!held) return { ok: false, key: g.key, reason: "above_authority" };
    if (g.key === "audit_logs.view") {
      const mine = new Set(auditCategoriesFor(actor));
      if (!g.auditCategories!.every((c) => mine.has(c))) return { ok: false, key: g.key, reason: "audit_categories" };
    }
  }
  return { ok: true };
}
