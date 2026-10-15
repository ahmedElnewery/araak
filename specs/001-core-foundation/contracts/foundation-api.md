# Core Foundation — Interface Contracts

**Status:** Draft logical operations (not definitive REST route names). JSON shapes, error codes, exact endpoints and anti-abuse limits need implementation-stage security review.

## Trust boundary
Every tenant-facing protected call: validate configured Host -> resolve tenant -> verify Supabase Auth -> verify mapped tenant staff + verified account/active tenant -> check live session -> check authorization -> execute RLS-bounded query/mutation. Never trust caller-supplied tenant_id, auth user ID, claimed privileges, locale or session ref to prove permission. Errors must not disclose account presence in another tenant. Admin application uses platform identity and distinct authorization checks.

## Tenant portal operations
| Operation | Actor/authorization | Conditions and effects |
| --- | --- | --- |
| GET tenant-public-identity | anonymous on valid host | return only own display name and approved display logo; neutral fallback; no cross-tenant metadata |
| POST auth/sign-in | anonymous, valid tenant host | input username-or-email + password; tenant-local username resolution protected from enumeration; Supabase Auth verify; active account and tenant checks |
| POST invitation/accept | recipient with current verified single-use link | <168h, latest link only; select username + password; create/activate correct identity and roles |
| POST invitation/resend | authorized tenant manager or permitted platform administrator | same recipient, >=900s cooldown, <=5 resends/rolling 24h; no denial side effects |
| POST recovery/request | public non-enumerating or manager after own-password verification | rate capped, secure emailed link, <60m single use; supersede older links on success |
| POST recovery/complete | intended recipient with verified link | set own password, invalidate older sessions on all devices |
| GET/POST account/username | signed-in self | regex and case-insensitive tenant uniqueness; no extra challenge beyond valid session |
| GET account/sessions | signed-in self | device/browser, login time, verified meaningful activity and Current; no IP or location shown |
| POST account/sessions/{other}/revoke | signed-in owner | confirmation in UI; revoke ONLY selected other session and refresh |
| POST account/sessions/revoke-other | signed-in owner | confirmation in UI; revoke all other sessions, current retained |
| POST tenant/staff/invite | manager/delegate within grant authority | correct tenant email reservation; distinct protected manager appointment procedure |
| POST tenant/staff/{id}/disable | authorized administrator | disables account and invalidates live session authorization |
| POST tenant/roles | appropriate manager/delegate | grant-ceiling and self-role-edit/self-membership ban enforced |
| POST tenant/roles/{id}/archive | authorized role manager | reject if ANY staff assignment remains |
| POST tenant/roles/{id}/restore | manager or explicit Restore Role delegate | full permission/scope authority and active-name uniqueness |
| GET tenant/audit | explicit audit_logs.view + categories | tenant/category scoped rows, totals, searches, details and exports |
| GET tenant/security-events | active tenant manager only | never delegated via audit_logs.view; own tenant |
| PATCH tenant/branding | manager or explicitly allowed platform intervention | display name/logo only; no color/subdomain edit |
| PATCH account/preferences | signed-in self | locale and theme personal choice |

## Platform administration operations
| Operation | Required authority | Conditions |
| --- | --- | --- |
| POST platform/tenants | platform Super Admin | create tenant, immutable subdomain, name, active/suspended, initial manager invite |
| PATCH platform/tenants/{id}/state | platform Super Admin | active/suspended only; invalidate ability of old sessions to operate |
| POST platform/tenants/{id}/managers/grant | authorized platform actor | initial invitation/promotion; never via tenant roles |
| POST platform/tenants/{id}/managers/revoke | authorized platform actor | reject removal of last activated active manager; revoke all demoted member sessions |
| POST platform/admins/invite | active platform actor with platform_admins.invite | recipient-bound token <24h, single use, no privileges before redemption |
| GET platform/audit | authorized platform audit access | platform events only, no default private tenant audit access |

Platform-admin revocation and first bootstrap MUST be restricted audited operations-runbook processes: no public/admin UI or application API. Tenant restoration likewise requires ops-only runbook, not UI/API.

## Contract tests
Each operation: authenticated positive, unauthenticated denial, forbidden permission, cross-tenant host/ID, disabled tenant/account, revoked session, stale token, concurrent mutations, no response leakage, category-scoped counts/exports. Explicitly test destructive or privilege-changing operations do not succeed through alternate API paths.

## Open design/approval dependencies
Final route names, payloads, platform-only identity auth mechanics, permissions and grant hierarchy, logo constraints, provider session revocation proof, mail transport/reconciliation, anti-abuse/IP budget and operation/audit retention for still-unapproved categories.
