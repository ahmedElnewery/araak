# Core Foundation — Proposed Data Model

**Status:** Logical design, not executable schema. Do not introduce business-module tables.

## Entities and invariants

| Entity | Candidate fields (not exhaustive) | Ownership/constraints |
| --- | --- | --- |
| tenants | id, display_name, immutable subdomain, state, optional logo_ref, created_at | platform metadata; subdomain globally unique and immutable |
| platform_admins | auth_user_id, enabled, explicit platform capabilities | platform only; distinct from tenant staff authorization |
| tenant_staff | id, tenant_id, auth_user_id, normalized verified email, username, enabled, activated_at | tenant; global unique active/disabled staff email; unique (tenant_id, normalized username); post-activation email immutable |
| email_reservations | normalized_email, tenant_id, invitation_id, expires_at, state | atomic global claim; existing staff identity takes precedence; expired unredeemed reservations reusable |
| staff_invitations | id, tenant_id, recipient normalized email, initial role IDs, token_hash, issued_at, expires_at, consumed_at, superseded_at, resend history | recipient-bound; expires <168h; only latest usable; no standalone cancellation |
| platform_invitations | id, target, inviter, token_hash, expires_at, consumed_at | platform-owned, <24h, invite privilege required |
| tenant_manager_grants | tenant_id, staff_id, granted_by, revoked_at | protected platform-managed authority; cannot remove last activated active manager |
| roles | id, tenant_id, name, archived_at | tenant; active name unique tenant-local; archived names reusable |
| staff_roles | tenant_id, staff_id, role_id | enforce all 3 IDs same tenant; no actor changes own memberships |
| permission_grants | tenant_id, role_id, resource, action, scope, allowed audit categories | typed catalog; only authorized grant ceiling; no protected manager grant |
| session_registry | id, tenant_id/staff_id or platform_admin_id, provider_session_ref, created_at, verified_activity_at, revoked_at, credential_epoch, coarse device/browser | immutable owner, verified activity; no displayed or requested geolocation |
| recovery_requests | account ref, token_hash, issued_at, expires_at, used_at, superseded_at, issuance counters | single-use <60m; newest only, 300s cooldown, 5 successful/24h |
| tenant_preferences | tenant_id, staff_id, locale, theme_mode | Arabic/English, System/Light/Dark |
| tenant_audit_events | id, tenant_id, actor_ref, event/category, resource_ref, occurred_at, safe metadata | append-only; categories restricted to delegate audit viewers |
| tenant_security_events | id, tenant_id, safe actor/context, event, occurred_at | manager-only visibility; 3-month retention |
| platform_audit_events | id, actor, event, occurred_at, safe context | platform-owned separate audit; no tenant-private default access |
| recovery_evidence | environment, point_in_time, operator, approved scope, database/file verification, result, occurred_at | platform operations record of restore rehearsal |

## Relationship and transaction rules

- All tenant-owned parent/child references use tenant-qualified uniqueness and composite FK integrity to block cross-tenant relationships independent of API validators.
- Foreign keys for tenant staff and tenant-owned session, invitation, role and audit references must retain historical audit attribution (do not cascade-delete staff history).
- Lowercase/canonical comparison uniqueness must be enforced in the database, not just client validation. Username display case is optional; normalized comparison is mandatory.
- Prevent changing tenant_id or immutable subdomain/email through guarded schema/API.
- Transaction boundaries enforce quotas/reservation locks, role editor membership checks, no self-role changes, last-manager protection, role archive preconditions and restore name uniqueness; retry safe on conflicts.
- Supabase Auth operations are external to ordinary Postgres transaction scope. Use explicit state machine and reconciliation that never grants access to incomplete accounts.
- Token verifier stores hashes and safely checks exact expiration and consumed/superseded states; authorization can be independently revoked before provider token expires.
- Audit writer is privileged and append-only. Operational automated expiry honors legal hold; staff cannot purge. Initial admin retention 12 months, security retention 3 months.
- Data ownership and RLS matrix will be refined into reviewed SQL migrations with EXPLAIN/security/integration tests.

## Deliberately not modeled

Beneficiaries, donors, volunteers, donations, accounts, financial transactions, generic forms/workflows and business reporting. All/Own/Assigned vocabulary may be defined here, but physical record assignment requires each future business specification.
