# Core Foundation — Research & Feasibility Decisions

**Date:** 2026-10-15  | **Status:** Architecture proposal; proofs pending
**Authority:** Constitution v2.0.0; spec decisions CL-002–CL-048. A research proposal does not supersede approved product requirements.

## R-01 — Identity, hostname and global email uniqueness
**Decision:** Resolve tenant from an allowlisted trusted portal hostname on server. Store tenant staff with a verified normalized email mapped one-to-one to an authoritative Supabase Auth identity. Normalize consistently (Unicode trimming, domain case normalization, comparison rules approved against Auth provider handling), without fabricating aliases. Unique lowercased/normalized email reservation across tenant staff accounts plus unexpired pending invites must be enforced through a DB-serialized issuance/activation workflow with careful reservation expiry rules.

**Alternatives rejected:** one shared multi-tenant staff account; trusting browser tenant_id; email aliases; tenant-per-Supabase-project.

**Proof pending:** transactional claim of expired invitation reservations concurrent with activation; invariant under Auth provisioning failures; exact normalization acceptable to Supabase; safe username lookup without account enumeration. A PostgreSQL transaction cannot atomically include the Auth Admin API, so design idempotent workflow, invitation state and compensating reconciliation/outbox. Disable app access to incomplete accounts.

## R-02 — Usernames, invitations and recovery
**Decision:** usernames tenant-local, case-insensitively unique, 3–30 ASCII chars, regex `^[A-Za-z]+(?:[._][A-Za-z]+)*$`. Staff invite single-use and strictly <168h; resent links invalidate old links, >=15 min issuance interval, <=5 successful resends in rolling 24h. Initial staff roles selected by authorized manager; staff chooses username/password in secure activation. Recovery email links single-use and strictly <60min, latest issuance invalidates previous, >=5min successful issuance interval, <=5 successfully issued in rolling 24h across recovery methods. Administrative staff reset checks manager's *own password* against Supabase Auth before issuing; employee alone chooses replacement password; completion revokes old sessions. Activated staff email immutable; lost mailbox -> disable old staff identity and invite a new one with new email/roles, keeping old references.

**Important:** Expiry/cooldown/counters must be enforced server-side irrespective of email provider link TTL. A denied resend/reset request must leave existing token and expiry unchanged. Tokens hashed at rest, bound to actor/tenant/account/recipient, and consumed atomically. Pending staff invitation cannot be manually cancelled in MVP. Invitee email ownership and token correspondence must be verified and tested with chosen Auth flow.

**Open:** provider integration, email sender, resend anti-abuse beyond per-account caps, neutral responses for unknown identities, simultaneous issuance/redeem proof.

## R-03 — Live sessions
**Decision:** Supabase Auth issues/verifies identity; an application server-side session ledger enforces device identity, revocation epoch, current device, verified meaningful activity and rolling inactivity. User-initiated authorized requests update activity, never passive polling or token refresh. Every protected handler checks tenant active, account active, role state and live session; RLS-accessible paths need a design that does not permit a still-valid old JWT to bypass the live session check.

**Do not assume:** application session ledger alone revokes Supabase refresh tokens; a short JWT TTL alone satisfies immediate suspension. Need explicit proof of Auth's per-device refresh termination, other-sessions/current session preservation and all-sessions invalidation, including concurrent refresh. If provider cannot meet these requirements, pause implementation and obtain compliant architecture approval.

## R-04 — Authorization
**Decision:** typed grants + tenant scope + eventual record scope; union across ordinary roles subject to higher-level denies and grant limits. Protected tenant-manager authority represented outside ordinary tenant roles; grant/revoke only by authorized platform actor with last-active-manager invariant, all sessions revoked on demotion. Tenant role editors may not edit any role assigned to themselves; nobody may change their own role membership. Archiving assigned roles disallowed; role restore uses distinct permission and full grant-ceiling validation. Event-category-specific delegated audit access; Security Logs only for active tenant managers.

**Open:** final grant hierarchy and permission catalog approval, atomic enforcement of editor/assigned-role race; exact module record own/assigned semantics deferred.

## R-05 — DB/RLS/Storage
**Decision:** tenant_id on tenant-owned rows, composite tenant foreign keys, RLS for all app-facing tenant data, separate platform metadata/audits; server privileged functions require authorization. Private Storage enforced by tenant and permission, not merely object path. Tenant logo display assets can use distinct validated distribution policy; logos must never reveal private files.

**Proof:** two-tenant direct DB and Storage negative tests, signed URL generation, post-suspension and post-revocation RLS access, privileged-key server-only exposure.

## R-06 — Hosting, bilingual UI and configuration
**Decision:** two separately deployed Next.js applications; approved admin hostname distinct from tenant subdomains. Wildcard subdomain DNS/TLS and proxy Host/Forwarded validation require deployment-specific threat review. packages/ui hosts shadcn primitives and fixed global palette. Tenant name required and logo optional; no tenant-controlled colors. Arabic initial/RTL, English LTR, persisted user appearance.

**Open:** exact domain(s), deployment provider, email transport, typography/colors/logo limits, CSP and app security headers.

## R-07 — Operations
**Decision:** separate Dev and Prod Supabase projects, migration-managed schema, no standing staging. Require at least daily recoverable DB + needed Storage-file backups retained rolling 30 days, encrypted/access restricted. Isolated DB+Storage restore before launch and at least every three calendar months, audited operation by authorized platform ops only, tenant-wide impact reviewed. Rollback/recovery plan includes schema deploy compatibility.

**Open:** feasible Supabase subscription/backup feature, Storage byte-level recovery, backup verification, exact RPO/RTO, operator/approval chain and quarterly scheduling. Until validated, Production launch is blocked.

## Research gates before /speckit.tasks authorizes security-sensitive work
- [ ] Project owner approves corrected v2-aligned spec and permission catalog.
- [ ] Identity email reservation/race and Supabase Auth mapping proof documented.
- [ ] Per-device refresh revocation and authorized operation denial proven.
- [ ] Rate-limit, email verification and reset single-use security reviewed.
- [ ] RLS/Storage policy and privilege-limiting proof reviewed.
- [ ] Host deployment and backup/restore capability verified; RPO/RTO approved.
