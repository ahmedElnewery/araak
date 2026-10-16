# Audit events, Security Log types and retention (US6)

Implementation record for Phase 8 (tasks T167–T180). It applies the owner-approved permission catalog
([permission-catalog.md](permission-catalog.md), GATE-RBAC) and the clarifications CL-032 to CL-035. Nothing here
widens what was approved. The open points at the end need an owner decision before they change.

## 1. Tenant audit categories

`staff`, `invitations`, `roles`, `tenant_settings`, `sessions`. These are the five categories of the approved catalog.
The "View audit log" switch grants all five, and an active manager always holds all five.

The database enforces the list in two places:

- `tenant_audit_events.category` must be in `private.approved_audit_categories()`.
- `permission_grants.audit_categories` must be a non-empty subset of the list.

`packages/authorization/src/audit-categories.ts` mirrors the list, and `tests/security/parity.test.ts` compares the two.

The task text for T172 also names a `tenant_lifecycle` category. That category is **not** in the approved catalog, so
it was not added. Tenant creation, suspension, reactivation and renaming are recorded under `tenant_settings`, as
they were before. See open point 1.

## 2. Security Log event types

| Type | Written when |
| --- | --- |
| `auth.sign_in_failed` | A tenant sign-in fails. `metadata.reason` is `invalid` or `throttled`, plus the HMAC of the identifier (never the identifier itself). |
| `authz.denied` | A portal guard refuses a page, route or export. `metadata.reason` is `permission:<key>` or `manager_only`. |
| `authz.privilege_escalation_denied` | A role, assignment or restore request goes above the grant ceiling. |
| `authz.self_membership_denied` | Someone tries to change their own role membership (CL-044). |
| `authz.role_self_edit_denied` | Someone tries to edit a role they hold (CL-027). |
| `session.invalid_reuse` | A revoked or expired session is presented again. |

The check constraint `tenant_security_events_event_ck` rejects any other type. The two `self_*` types already existed
before Phase 8. They are kept as their own types because both are denied privilege-escalation attempts under CL-034.

**Flood control.** Events raised by the application go through `public.svc_write_security_event`. An event is dropped
when an identical one (same tenant, actor, type and metadata) was written in the last 60 seconds. Denials recorded
inside RPCs are not deduplicated.

Platform sign-in failures use the same `auth.sign_in_failed` name in the platform audit.

## 3. Who reads what

| Reader | Tenant audit | Security Log | Platform audit |
| --- | --- | --- | --- |
| Staff with `audit_logs.view` | Their granted categories only, in their own tenant. This covers rows, totals, details, search, pages and export. | Denied | Denied |
| Active tenant manager | All five categories, own tenant | Own tenant | Denied |
| Platform admin with `platform_audit.view` | Denied | Denied | All platform events |

Every check runs in the database (`list_tenant_audit`, `get_tenant_audit_event`, `export_tenant_audit`,
`list_security_events`, `get_security_event`, `export_security_events` and `platform_list_audit`). Each call re-reads
the caller's live grants, so a permission removed mid-session takes effect on the next request.

An id from another tenant, from a category the caller does not hold, or from another log always returns the same
`event_not_found`.

Reading is never audited (FR-032). Each export is audited as `audit.exported` under `tenant_settings`. Its metadata
holds the log, the filters and the row count, and an export is capped at 5,000 rows.

## 4. Retention and legal holds

`private.purge_expired_audit()` runs every day at 03:17 UTC (`pg_cron` job `purge-expired-audit`). It deletes:

- tenant audit events older than 12 months (CL-033);
- Security Log events older than 3 months (CL-034).

Both ages are counted from the event time. The function then writes one `retention.purged` platform event that holds
only the two counts. The platform audit has no approved retention period, so it is never purged.

A row in `audit_legal_holds` keeps the events of its target (`tenant_audit` or `tenant_security`) whose time falls in
`[from_ts, until_ts]`. When the hold names a tenant or a category, only that tenant or category is kept. The events are
kept for as long as the hold row exists.

Holds are written by operators only. `docs/operations/retention.md` (T193) will describe how a hold is approved and
how it is lifted. Nobody can purge by hand: the append-only triggers refuse every `DELETE` unless the purge function
itself set the transaction flag.

## 5. Open points for the owner

1. **Tenant lifecycle category.** Should tenant creation, suspension and reactivation get their own category (for
   example `tenant_lifecycle`, manager-only)? Today they are part of `tenant_settings`, so they are visible to every
   delegate who holds "View audit log". Adding a category changes the approved catalog.
2. **Export record visibility.** `audit.exported` lives under `tenant_settings`. With the current all-categories switch,
   every audit viewer can see who exported. A manager-only category would hide it from delegates.
