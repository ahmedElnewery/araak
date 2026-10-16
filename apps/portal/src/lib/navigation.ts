import { can, type EffectivePermissions, type PermissionKey } from "@workspace/authorization";
import type { Dictionary } from "@workspace/i18n";

export type NavIcon =
  | "home" | "beneficiaries" | "donors" | "volunteers" | "settings" | "staff" | "invite" | "roles" | "branding" | "audit" | "security"
  | "profile" | "appearance" | "password" | "sessions";
type Requirement = { kind: "any" } | { kind: "manager" } | { kind: "permission"; keys: readonly PermissionKey[] };
type NavKey = keyof Dictionary["portal"]["nav"];
type GroupId = "main" | "system";

type Definition = {
  id: string; href: string; label: NavKey; icon: NavIcon; requires: Requirement;
  /** False until the page exists; flip it when the owning story ships so no link ever points at a missing route. */
  built: boolean;
  /** Hidden when this also holds: the item is then reachable from another page instead (e.g. a button on it). */
  unless?: Requirement;
  children?: readonly Definition[];
};

/** Single source of truth for the portal's primary navigation and its sections' secondary sidebars (FR-040). */
const GROUPS: readonly { id: GroupId; label: NavKey; items: readonly Definition[] }[] = [
  {
    id: "main", label: "mainGroup",
    items: [
      { id: "home", href: "/", label: "home", icon: "home", requires: { kind: "any" }, built: true },
      // Business modules: not in Core Foundation scope (SC-010). Listed so the shell is designed for them; hidden until built.
      { id: "beneficiaries", href: "/beneficiaries", label: "beneficiaries", icon: "beneficiaries", requires: { kind: "manager" }, built: false },
      { id: "donors", href: "/donors", label: "donors", icon: "donors", requires: { kind: "manager" }, built: false },
      { id: "volunteers", href: "/volunteers", label: "volunteers", icon: "volunteers", requires: { kind: "manager" }, built: false },
    ],
  },
  {
    id: "system", label: "systemGroup",
    items: [
      {
        id: "settings", href: "/settings", label: "settings", icon: "settings", requires: { kind: "any" }, built: true,
        children: [
          { id: "staff", href: "/settings/staff", label: "staff", icon: "staff", requires: { kind: "permission", keys: ["staff.view"] }, built: true },
          // Whoever can see the staff directory invites from its button; others who may invite get the page here
          {
            id: "invite", href: "/settings/staff/invite", label: "inviteStaff", icon: "invite", built: true,
            requires: { kind: "permission", keys: ["staff.invite"] }, unless: { kind: "permission", keys: ["staff.view"] },
          },
          { id: "roles", href: "/settings/roles", label: "roles", icon: "roles", requires: { kind: "permission", keys: ["roles.view"] }, built: true },
          { id: "branding", href: "/settings/branding", label: "branding", icon: "branding", requires: { kind: "manager" }, built: true },
        ],
      },
      { id: "audit", href: "/audit", label: "auditLog", icon: "audit", requires: { kind: "permission", keys: ["audit_logs.view"] }, built: true },
      { id: "security", href: "/security-logs", label: "securityLogs", icon: "security", requires: { kind: "manager" }, built: true },
    ],
  },
];

/** The person's own pages: opened from the account menu, never listed in the primary navigation. */
const ACCOUNT: readonly Definition[] = [
  { id: "profile", href: "/account", label: "profile", icon: "profile", requires: { kind: "any" }, built: true },
  { id: "appearance", href: "/account/appearance", label: "appearance", icon: "appearance", requires: { kind: "any" }, built: true },
  { id: "password", href: "/account/password", label: "password", icon: "password", requires: { kind: "any" }, built: true },
  { id: "sessions", href: "/account/sessions", label: "sessions", icon: "sessions", requires: { kind: "any" }, built: true },
];

export type NavItem = { id: string; href: string; label: string; icon: NavIcon; children: NavItem[] };
export type NavGroup = { id: GroupId; label: string; items: NavItem[] };

function allowed(req: Requirement, perms: EffectivePermissions): boolean {
  if (req.kind === "any") return true;
  if (req.kind === "manager") return perms.isManager;
  return req.keys.some((k) => can(perms, k)); // `can` already grants every tenant permission to an active manager
}

const walk = (defs: readonly Definition[], perms: EffectivePermissions, t: Dictionary["portal"]["nav"]): NavItem[] =>
  defs.flatMap((d) => {
    if (!d.built || !allowed(d.requires, perms) || (d.unless && allowed(d.unless, perms))) return [];
    const children = walk(d.children ?? [], perms, t);
    // a parent is only a container: hide it when nothing inside is available
    if (d.children && children.length === 0) return [];
    return [{ id: d.id, href: d.href, label: t[d.label], icon: d.icon, children }];
  });

/** Groups and items the actor may see, localized. Server routes still enforce access; this only avoids dead or forbidden links. */
export function buildNavigation(perms: EffectivePermissions, t: Dictionary["portal"]["nav"]): NavGroup[] {
  return GROUPS.map((g) => ({ id: g.id, label: t[g.label], items: walk(g.items, perms, t) })).filter((g) => g.items.length > 0);
}

/** The account section's pages (every signed-in staff member has all of them). */
export function buildAccountSection(perms: EffectivePermissions, t: Dictionary["portal"]["nav"]): NavItem[] {
  return walk(ACCOUNT, perms, t);
}
