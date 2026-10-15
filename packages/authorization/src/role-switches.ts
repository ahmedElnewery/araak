import { AUDIT_CATEGORIES, type AuditCategory, type PermissionKey } from "./catalog";
import type { EffectivePermissions } from "./evaluate";
import { canGrant } from "./grant-ceiling";

/**
 * The four plain switches of the simplified roles UX (docs/decisions/permission-catalog.md §6). Scopes, the ceiling
 * explanation and raw keys never reach the screen; the database still enforces every grant.
 */
export const ROLE_SWITCHES = ["viewStaff", "manageStaff", "manageRoles", "viewAudit"] as const;
export type RoleSwitch = (typeof ROLE_SWITCHES)[number];

const SWITCH_KEYS: Record<RoleSwitch, readonly PermissionKey[]> = {
  viewStaff: ["staff.view"],
  manageStaff: ["staff.invite", "staff.disable", "staff.enable", "staff.roles.assign"],
  manageRoles: ["roles.view", "roles.create", "roles.update", "roles.archive", "roles.restore"],
  viewAudit: ["audit_logs.view"],
};

export type GrantPayload = { key: PermissionKey; scope: "all"; auditCategories?: AuditCategory[] };
export type StoredGrant = { key: string; scope: string; auditCategories?: readonly string[] | null };

/** Switch state -> grants. Managing staff implies viewing them; the audit switch grants all five categories. */
export function switchesToGrants(on: ReadonlySet<RoleSwitch> | readonly RoleSwitch[]): GrantPayload[] {
  const set = new Set(on);
  if (set.has("manageStaff")) set.add("viewStaff");
  const out: GrantPayload[] = [];
  for (const s of ROLE_SWITCHES) {
    if (!set.has(s)) continue;
    for (const key of SWITCH_KEYS[s]) {
      out.push(key === "audit_logs.view" ? { key, scope: "all", auditCategories: [...AUDIT_CATEGORIES] } : { key, scope: "all" });
    }
  }
  return out;
}

/** Stored grants -> switch state. `extra` is true when the role carries grants the four switches cannot express. */
export function grantsToSwitches(grants: readonly StoredGrant[]): { on: RoleSwitch[]; extra: boolean } {
  const held = new Set(grants.map((g) => g.key));
  const on = ROLE_SWITCHES.filter((s) => SWITCH_KEYS[s].every((k) => held.has(k)));
  const expressible = new Set(switchesToGrants(on).map((g) => g.key as string));
  const extra = grants.some((g) => !expressible.has(g.key) || g.scope !== "all")
    || grants.some((g) => g.key === "audit_logs.view" && (g.auditCategories?.length ?? 0) !== AUDIT_CATEGORIES.length);
  return { on, extra };
}

/** Which switches this actor may offer (UI hint; the database ceiling is authoritative). */
export function offerableSwitches(actor: EffectivePermissions): RoleSwitch[] {
  return ROLE_SWITCHES.filter((s) => canGrant(actor, switchesToGrants([s])).ok);
}

export type RoleGrantPayload = { key: string; scope: string; auditCategories?: string[] | null };

/**
 * The grants to save when an actor edits a role through the switches. Only the switches the actor can offer are
 * taken from the form; every stored grant of a switch the actor cannot offer is kept exactly as stored (key, scope and
 * audit categories), so an edit never touches authority above the actor's ceiling and the database does not read the
 * edit as removing it (CL-031).
 */
export function applySwitchEdit(
  stored: readonly StoredGrant[], submitted: readonly RoleSwitch[], offered: readonly RoleSwitch[],
): RoleGrantPayload[] {
  const offeredSet = new Set(offered);
  const lockedKeys = new Set<string>(ROLE_SWITCHES.filter((s) => !offeredSet.has(s)).flatMap((s) => SWITCH_KEYS[s]));
  const fresh: RoleGrantPayload[] = switchesToGrants(submitted.filter((s) => offeredSet.has(s)))
    .filter((g) => !lockedKeys.has(g.key));
  const kept: RoleGrantPayload[] = stored
    .filter((g) => lockedKeys.has(g.key))
    .map((g) => (g.auditCategories == null
      ? { key: g.key, scope: g.scope }
      : { key: g.key, scope: g.scope, auditCategories: [...g.auditCategories] }));
  return [...fresh, ...kept];
}
