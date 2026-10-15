# Core Foundation — Research & Feasibility Decisions

**Date:** 2026-10-15  | **Status:** Architecture proposal; proofs pending
**Authority:** Constitution v2.0.0; spec decisions CL-002–CL-048. A research proposal does not supersede approved product requirements.

## R-01 — Identity, hostname and global email uniqueness
**Decision:** Resolve tenant from an allowlisted trusted portal hostname on server. Store tenant staff with a verified normalized email mapped one-to-one to an authoritative Supabase Auth identity. Normalize consistently (Unicode trimming, domain case normalization, comparison rules approved against Auth provider handling), without fabricating aliases. Unique lowercased/normalized email reservation across tenant staff accounts plus unexpired pending invites must be enforced through a DB-serialized issuance/activation workflow with careful reservation expiry rules.

**Alternatives rejected:** one shared multi-tenant staff account; trusting browser tenant_id; email aliases; tenant-per-Supabase-project.

**Proof pending:** transactional claim of expired invitation reservations concurrent with activation; invariant under Auth provisioning failures; exact normalization acceptable to Supabase; safe username lookup without account enumeration. A PostgreSQL transaction cannot atomically include the Auth Admin API, so design idempotent workflow, invitation state and compensating reconciliation/outbox. Disable app access to incomplete accounts.

### R-01 Proof results (T019, 2026-10-15, Development project)
Method: `tests/proofs/email-reservation.proof.test.ts` (scratch schema `proof_email`, dropped afterwards; Auth Admin API on the Dev project).
- **Race:** 20 concurrent claims for one email (three case/whitespace variants, two tenants) via `pg_advisory_xact_lock(hashtextextended('email:'||normalized,0))` -> exactly 1 success, 1 reservation row.
- Same invitation re-claims idempotently; an activated staff email blocks every claimant; an expired reservation is reclaimable.
- **Auth failure after reservation:** `auth.admin.createUser` rejected (weak password) -> no Auth identity, no staff row, so no usable access; reconciliation (release reservation with no staff row) lets a later claim succeed. An Auth user without a `tenant_staff` row has no app access and is deleted by reconciliation.
- **Approved normalization (revised after the TS<->DB parity test):** trim an explicit edge-whitespace set (identical regex in SQL and TypeScript) and lowercase **ASCII** letters only; only printable-ASCII addresses are accepted (CHECK constraints on `tenant_staff` and `staff_invitations`), because Postgres `lower()` is collation dependent and a non-ASCII case variant could be a different key here but one identity in Auth. This replaces the earlier `lower(btrim())` proposal. Supabase Auth lowercases addresses and rejects case variants as duplicates; `name@x` and `name+tag@x` are DISTINCT Auth identities, so the app must not strip dots or plus tags and must not generate aliases.
- Note: the mailbox-collision rule (platform admin vs staff) must also be checked inside the claim function (GATE-COLLIDE).

## R-02 — Usernames, invitations and recovery
**Decision:** usernames tenant-local, case-insensitively unique, 3–30 ASCII chars, regex `^[A-Za-z]+(?:[._][A-Za-z]+)*$`. Staff invite single-use and strictly <168h; resent links invalidate old links, >=15 min issuance interval, <=5 successful resends in rolling 24h. Initial staff roles selected by authorized manager; staff chooses username/password in secure activation. Recovery email links single-use and strictly <60min, latest issuance invalidates previous, >=5min successful issuance interval, <=5 successfully issued in rolling 24h across recovery methods. Administrative staff reset checks manager's *own password* against Supabase Auth before issuing; employee alone chooses replacement password; completion revokes old sessions. Activated staff email immutable; lost mailbox -> disable old staff identity and invite a new one with new email/roles, keeping old references.

**Important:** Expiry/cooldown/counters must be enforced server-side irrespective of email provider link TTL. A denied resend/reset request must leave existing token and expiry unchanged. Tokens hashed at rest, bound to actor/tenant/account/recipient, and consumed atomically. Pending staff invitation cannot be manually cancelled in MVP. Invitee email ownership and token correspondence must be verified and tested with chosen Auth flow.

**Open:** provider integration, email sender, resend anti-abuse beyond per-account caps, neutral responses for unknown identities, simultaneous issuance/redeem proof.

### R-02 Proof results (T020, 2026-10-15, Development project)
Method: `tests/proofs/auth-flows.proof.test.ts` (scratch schema `proof_auth` and a scratch trigger on `auth.users`, both removed afterwards).
1. A resolver function EXECUTE-granted to `service_role` only (anon/authenticated denied) plus `signInWithPassword`: a wrong password and an unknown username both yield `400 invalid_credentials` with the same message (the unknown path signs in with a dummy email).
2. A single-use emailed token redeemed in SQL (`update ... where consumed_at is null and now() < expires_at`) followed by `auth.admin.createUser({email_confirm:true})` activates the account (`email_confirmed_at` set, sign-in works); the second redemption and an expired token return nothing.
3. A manager password check with a throwaway non-persisting client DOES create a provider session; it must be revoked immediately (`auth.admin.signOut(jwt,'local')`), after which the session count is back to its starting value.
4. `BEFORE UPDATE OF email, email_change ON auth.users` trigger blocks both `auth.updateUser({email})` and `auth.admin.updateUserById({email})` for linked staff (email and `email_change` unchanged); password changes still work.
5. Timing, 25 samples each, wrong password: known user p50 219 ms / p95 260 ms / max 274 ms; unknown user p50 139 ms / p95 153 ms / max 160 ms. **The two paths differ by ~80 ms at p50** (Auth does not hash for an unknown user). To make them indistinguishable the unknown path must be padded: run a real `signInWithPassword` against a dummy existing identity (not a skipped call), and T102 must use a **tolerance of 250 ms on the p50 gap** until measured again after padding.
6. Rate limits: the password-grant limit is not exposed in the project config API. Empirical probe: 80 rapid failed sign-ins each with a different forged `X-Forwarded-For` were first limited (429) at request #69 -> Auth keys limits on the connecting client address, not on forwarded headers. When sign-in is proxied through Next.js, **all users share the server's egress IP**, so Supabase's limit would throttle everyone together and cannot protect individual identifiers. App-level throttling per (tenant, identifier) and per real client IP (derived with `TRUSTED_PROXY_HOPS`) is required: see `docs/decisions/auth-abuse-controls.md`.
- **Password policy (approved with this gate):** minimum 8 characters, with lowercase, uppercase and digits, set in Supabase Auth (`password_min_length=8`, `password_required_characters=abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789`) and mirrored by the application validator (T094). Public signup is disabled (`disable_signup=true`); admin-created users still work.

## R-03 — Live sessions
**Decision:** Supabase Auth issues/verifies identity; an application server-side session ledger enforces device identity, revocation epoch, current device, verified meaningful activity and rolling inactivity. User-initiated authorized requests update activity, never passive polling or token refresh. Every protected handler checks tenant active, account active, role state and live session; RLS-accessible paths need a design that does not permit a still-valid old JWT to bypass the live session check.

**Do not assume:** application session ledger alone revokes Supabase refresh tokens; a short JWT TTL alone satisfies immediate suspension. Need explicit proof of Auth's per-device refresh termination, other-sessions/current session preservation and all-sessions invalidation, including concurrent refresh. If provider cannot meet these requirements, pause implementation and obtain compliant architecture approval.

### R-03 Proof results (T018, 2026-10-15, Development project)
Method: `tests/proofs/session-revocation.proof.test.ts`, 9 tests, all passed (367 s including a real 300 s wait). Auth settings in force: `jwt_exp=300`, refresh-token rotation on, reuse interval 10 s.
- **JWT lifetime:** `exp - iat = 300` s. After a real wait past `exp`, the server rejects the old access token and the refresh token issues a new one (same `session_id`, again 300 s). **JWT expiry of 300 s is approved** (defense in depth only).
- (1) The `session_id` claim equals an `auth.sessions` row id of that user.
- (2) Deleting one `auth.sessions` row through a SECURITY DEFINER function blocks refresh for that session only; a second session of the same user still refreshes. `auth.admin.signOut(jwt,'local')` behaves the same.
- (3) `auth.admin.signOut(jwt,'others')` keeps the session of the given JWT and removes the others.
- (4) An access token whose session was deleted still verifies (`getClaims`, signature/exp only) until it expires. **The live-session registry check (`private.current_session_is_live`) is therefore mandatory** on every RLS and server path.
- (5) Refresh racing revocation (8 runs): both orders occur (revoke first, or refresh first and then the session is gone), and in every run the session row is gone and neither the original nor the newly issued refresh token works afterwards. No resurrection.
- (7) Observed rotation behaviour: replaying the immediate parent refresh token after the 10 s reuse interval is still ACCEPTED while its child has not been used; replaying a token two generations old is rejected. Revocation must not rely on refresh-token reuse detection.
- **Method adopted for `private.revoke_sessions`:** set `session_registry.revoked_at` and delete the `auth.sessions` rows in the same transaction.

## R-04 — Authorization
**Decision:** typed grants + tenant scope + eventual record scope; union across ordinary roles subject to higher-level denies and grant limits. Protected tenant-manager authority represented outside ordinary tenant roles; grant/revoke only by authorized platform actor with last-active-manager invariant, all sessions revoked on demotion. Tenant role editors may not edit any role assigned to themselves; nobody may change their own role membership. Archiving assigned roles disallowed; role restore uses distinct permission and full grant-ceiling validation. Event-category-specific delegated audit access; Security Logs only for active tenant managers.

**Open:** final grant hierarchy and permission catalog approval, atomic enforcement of editor/assigned-role race; exact module record own/assigned semantics deferred.

## R-05 — DB/RLS/Storage
**Decision:** tenant_id on tenant-owned rows, composite tenant foreign keys, RLS for all app-facing tenant data, separate platform metadata/audits; server privileged functions require authorization. Private Storage enforced by tenant and permission, not merely object path. Tenant logo display assets can use distinct validated distribution policy; logos must never reveal private files.

**Proof:** two-tenant direct DB and Storage negative tests, signed URL generation, post-suspension and post-revocation RLS access, privileged-key server-only exposure.

## R-06 — Hosting, bilingual UI and configuration
**Decision:** two separately deployed Next.js applications; approved admin hostname distinct from tenant subdomains. Wildcard subdomain DNS/TLS and proxy Host/Forwarded validation require deployment-specific threat review. packages/ui hosts shadcn primitives and fixed global palette. Tenant name required and logo optional; no tenant-controlled colors. Arabic initial/RTL, English LTR, persisted user appearance.

**Decided (owner, 2026-10-15):** the palette starts from the non-binding reference in `docs/design-references/` with WCAG contrast fixes; the accent is green in Dark and teal in Light; fonts are Cairo (Arabic) and Inter (Latin).

**Open:** exact domain(s), deployment provider, email transport, final palette sign-off, logo limits, CSP and app security headers.

## R-07 — Operations
**Decision:** separate Dev and Prod Supabase projects, migration-managed schema, no standing staging. Require at least daily recoverable DB + needed Storage-file backups retained rolling 30 days, encrypted/access restricted. Isolated DB+Storage restore before launch and at least every three calendar months, audited operation by authorized platform ops only, tenant-wide impact reviewed. Rollback/recovery plan includes schema deploy compatibility.

**Open:** feasible Supabase subscription/backup feature, Storage byte-level recovery, backup verification, exact RPO/RTO, operator/approval chain and quarterly scheduling. Until validated, Production launch is blocked.

## Research gates before /speckit.tasks authorizes security-sensitive work
Stop rule: if a proof fails, pause the dependent tasks listed in the tasks.md Gate Register and request an approved alternative before continuing.
- [ ] Project owner approves corrected v2-aligned spec and permission catalog. Drafts: spec amendment (T017), [permission-catalog.md](../../docs/decisions/permission-catalog.md) (T021, PENDING OWNER APPROVAL), [platform-staff-email-collision.md](../../docs/decisions/platform-staff-email-collision.md) (T024, pending owner decision).
- [x] Identity email reservation/race and Supabase Auth mapping proof documented: R-01 "Proof results" (T019).
- [x] Per-device refresh revocation and authorized operation denial proven: R-03 "Proof results" (T018); JWT 300 s approved by experiment.
- [ ] Rate-limit, email verification and reset single-use security reviewed. Proof recorded in R-02 "Proof results" (T020); [auth-abuse-controls.md](../../docs/decisions/auth-abuse-controls.md) is PENDING OWNER APPROVAL (GATE-ABUSE).
- [ ] RLS/Storage policy and privilege-limiting proof reviewed (pending T036-T041 and the Phase 2 RLS tests). Branding: [branding.md](../../docs/decisions/branding.md) (T022, pending).
- [ ] Host deployment and backup/restore capability verified; RPO/RTO approved: [operations.md](../../docs/decisions/operations.md) (T023, PENDING OWNER AND OPERATOR APPROVAL).
