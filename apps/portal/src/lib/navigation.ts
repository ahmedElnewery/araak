import { can, type EffectivePermissions, type PermissionKey } from "@workspace/authorization";
import type { Dictionary } from "@workspace/i18n";

export type NavIcon = "home" | "account" | "settings" | "staff" | "roles" | "branding" | "audit" | "security";
type Requirement = { kind: "any" } | { kind: "manager" } | { kind: "permission"; keys: readonly PermissionKey[] };
type NavKey = keyof Dictionary["portal"]["nav"];

type Definition = {
  id: string; href: string; label: NavKey; icon: NavIcon; requires: Requirement;
  /** False until the page exists; flip it when the owning story ships so no link ever points at a missing route. */
  built: boolean;
  children?: readonly Definition[];
};

/** Single source of truth for the portal's primary navigation and the Settings secondary sidebar (FR-040). */
const DEFINITIONS: readonly Definition[] = [
  { id: "home", href: "/", label: "home", icon: "home", requires: { kind: "any" }, built: true },
  { id: "account", href: "/account", label: "account", icon: "account", requires: { kind: "any" }, built: true },
  {
    id: "settings", href: "/settings", label: "settings", icon: "settings", requires: { kind: "any" }, built: true,
    children: [
      { id: "staff", href: "/settings/staff", label: "staff", icon: "staff", requires: { kind: "permission", keys: ["staff.view"] }, built: true },
      { id: "invite", href: "/settings/staff/invite", label: "inviteStaff", icon: "staff", requires: { kind: "permission", keys: ["staff.invite"] }, built: true },
      { id: "roles", href: "/settings/roles", label: "roles", icon: "roles", requires: { kind: "permission", keys: ["roles.view"] }, built: true },
      { id: "branding", href: "/settings/branding", label: "branding", icon: "branding", requires: { kind: "manager" }, built: true },
    ],
  },
  { id: "audit", href: "/audit", label: "auditLog", icon: "audit", requires: { kind: "permission", keys: ["audit_logs.view"] }, built: false },
  { id: "security", href: "/security-logs", label: "securityLogs", icon: "security", requires: { kind: "manager" }, built: false },
];

export type NavItem = { id: string; href: string; label: string; icon: NavIcon; children: NavItem[] };

function allowed(req: Requirement, perms: EffectivePermissions): boolean {
  if (req.kind === "any") return true;
  if (req.kind === "manager") return perms.isManager;
  return req.keys.some((k) => can(perms, k)); // `can` already grants every tenant permission to an active manager
}

/** Items the actor may see, localized. Server routes still enforce access; this only avoids dead or forbidden links. */
export function buildNavigation(perms: EffectivePermissions, t: Dictionary["portal"]["nav"]): NavItem[] {
  const walk = (defs: readonly Definition[]): NavItem[] =>
    defs
      .filter((d) => d.built && allowed(d.requires, perms))
      .map((d) => ({ id: d.id, href: d.href, label: t[d.label], icon: d.icon, children: walk(d.children ?? []) }))
      // Settings is only a container: hide it when nothing inside is available
      .filter((i) => i.id !== "settings" || i.children.length > 0);
  return walk(DEFINITIONS);
}
