import type { AuditCategory, ManagerOnlyKey, PermissionKey, RecordScope } from "./catalog";
import { AUDIT_CATEGORIES, isTenantGrantable } from "./catalog";

export type EffectiveGrant = { key: PermissionKey; scope: RecordScope; auditCategories: AuditCategory[] | null };
export type EffectivePermissions = { isManager: boolean; permissions: EffectiveGrant[] };

type RpcClient = {
  rpc(fn: "my_effective_permissions"): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Loads the actor's grants once per request. The RPC derives the actor from auth.uid() and the JWT session. */
export async function loadEffectivePermissions(ctx: { supabase: RpcClient }): Promise<EffectivePermissions> {
  const { data, error } = await ctx.supabase.rpc("my_effective_permissions");
  if (error || !data) throw new Error("permissions_unavailable");
  return data as EffectivePermissions;
}

/** UI/early-check helper. RLS and RPC checks in the database stay authoritative. */
export function can(perms: EffectivePermissions, key: PermissionKey | ManagerOnlyKey, scope?: RecordScope): boolean {
  if (!isTenantGrantable(key)) return perms.isManager; // manager-only authorities
  if (perms.isManager) return true;
  return perms.permissions.some((g) => g.key === key && (scope === undefined || g.scope === "all" || g.scope === scope));
}

export function auditCategoriesFor(perms: EffectivePermissions): AuditCategory[] {
  if (perms.isManager) return [...AUDIT_CATEGORIES];
  const held = new Set<AuditCategory>();
  for (const g of perms.permissions) if (g.key === "audit_logs.view") g.auditCategories?.forEach((c) => held.add(c));
  return [...held];
}
