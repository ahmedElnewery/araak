# Decision: Permission catalog and grant ceiling

**Status: APPROVED by the project owner (2026-10-15)** (⛔ GATE-RBAC). `private`/`public` RBAC migrations (T031, T034, T035) seed from this draft; they must not be called "secure/complete" until the owner signs off.
**Traces to:** FR-024–FR-027, CL-029, CL-030, CL-032, CL-035; research R-04.

## 1. Tenant-grantable permission keys

A tenant manager (or an actor who passes the grant ceiling, §4) may place these keys on tenant roles.

| Key | Supports scopes | Meaning |
| --- | --- | --- |
| `staff.view` | all | List and open staff of the actor's tenant |
| `staff.invite` | all | Issue a staff invitation (initial roles chosen from the ceiling) |
| `staff.disable` | all | Disable a staff account (revokes its sessions) |
| `staff.enable` | all | Re-enable a disabled staff account |
| `staff.roles.assign` | all | Add/remove role memberships of **other** staff |
| `roles.view` | all | List roles and their grants |
| `roles.create` | all | Create a role (grants must pass the ceiling) |
| `roles.update` | all | Rename a role and change its grants (never a role assigned to oneself) |
| `roles.archive` | all | Archive an unassigned role |
| `roles.restore` | all | Restore an archived role (full ceiling check) |
| `audit_logs.view` | all, with `audit_categories` ⊆ `staff`, `invitations`, `roles`, `tenant_settings`, `sessions` | Read tenant audit events of the granted categories only |

`record_scope` (`all`/`own`/`assigned`) exists in the catalog for future modules. In this feature every key above supports `all` only.

## 2. Manager-only, non-grantable authorities

Held by an active tenant manager (an unrevoked `tenant_manager_grants` row), never representable as a role grant (`tenant_grantable = false`, enforced by trigger):

- Tenant branding edit (FR-036)
- Security Log view (CL-035)
- Staff invitation **resend** (FR-009)
- Manager-assisted staff password reset (CL-015)

## 3. Platform capabilities

`tenants.manage`, `tenants.managers.manage`, `tenants.staff.manage`, `platform_admins.invite`, `platform_audit.view` (held in `platform_admins.capabilities`, a closed set enforced by CHECK).

## 4. Grant ceiling

An actor may confer a grant only if:
1. the key is `tenant_grantable`; and
2. the actor is an active manager (may confer any grantable key), **or** holds the same key with scope `all` or the identical scope; and
3. for `audit_logs.view`, the requested categories are a subset of the categories the actor holds.

The SQL functions `private.actor_can_grant` / `private.actor_can_grant_role` are authoritative; the TypeScript `canGrant` only drives UI hints. All role, membership and role-bearing invitation mutations take `private.rbac_lock(tenant_id)` so the check and the write are atomic.

Further invariants: nobody changes their own role membership; a role editor may not edit any role assigned to themselves; archived roles cannot be assigned (CL-029); a tenant's last active manager cannot be demoted or disabled.

## 5. Open questions for the owner

1. **Suspended tenants and the last-manager rule:** may a platform admin demote or replace the last manager while the tenant is suspended? Proposed default: yes, via platform capability `tenants.managers.manage`, because the tenant cannot act for itself.
2. **Platform-initiated staff password reset:** should `tenants.staff.manage` mirror CL-015 (platform admin re-enters their own password; employee alone chooses the new one)? Proposed default: yes.

## 6. Simplified user experience (owner, 2026-10-15)

Staff and managers want the simplest possible screens. The permission engine above does not change (database, RLS and tests stay as built); only what people see changes.

- **One ready-made role: "مدير الجمعية" (Association Manager).** It is the protected manager authority (section 2), granted by a platform admin. No other preset roles are shipped. Everything else is a custom role the manager creates.
- **Four plain switches instead of 11 permission keys** in the role editor:
  1. عرض الموظفين = `staff.view`
  2. إدارة الموظفين = `staff.invite` + `staff.disable` + `staff.enable` + `staff.roles.assign` (implies the first switch)
  3. إدارة الأدوار = `roles.view` + `roles.create` + `roles.update` + `roles.archive` + `roles.restore`
  4. عرض سجل العمليات = `audit_logs.view`
- **Hidden from every screen:** record scopes, the grant-ceiling explanation, and the permission keys themselves. A delegate only sees the switches they hold themselves; the database still enforces the ceiling.
- Staff without any permission do not see the roles section at all. An invitation picks one role from a simple list.
- **Confirmed by the owner (2026-10-15):** the fourth switch grants all five audit categories (no category picker). The Security Log stays manager-only.

## Approval

| | |
| --- | --- |
| Owner decision | ☑ Approved (2026-10-15) |
| Date / name | |
