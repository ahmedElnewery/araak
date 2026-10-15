# Implementation Plan: Core Foundation

**Feature:** 001-core-foundation
**Branch:** 001-core-foundation
**Plan date:** 2026-10-15
**Status:** Draft technical plan; NOT approval to deploy
**Specification:** ./spec.md
**Constitution:** ../../.specify/memory/constitution.md, v2.0.0 (authoritative)
**Supporting artifacts:** research.md, data-model.md, contracts/foundation-api.md, contracts/security-matrix.md, quickstart.md

## Summary

Build the foundation for a white-label, multi-tenant charity management portal. Deliver two isolated Next.js application surfaces (tenant portal and platform administration), a single shared pnpm/Turborepo workspace and shadcn-based UI package, Supabase-backed tenant-bound staff authentication, platform-controlled tenant provisioning and protected manager authority, multi-role authorization, server-enforced revocable sessions, safe audit history, bilingual accessible shells, and verified two-environment release/recovery operations. Do not introduce business-domain records or unapproved screens.

The verified staff email is globally unique across ALL tenant staff identities and unexpired pending invitations under Constitution v2.0.0 / CL-048; the same username may be reused by another tenant. No cross-tenant staff switching or same-email aliases.

## Technical Context

| Concern | Decision / constraint |
| --- | --- |
| Languages/runtime | Strict TypeScript, Next.js App Router on supported Node.js LTS |
| UI | Tailwind CSS, shadcn/ui primitives centralized in packages/ui, fixed design tokens |
| Workspace | pnpm workspaces + Turborepo; apps/portal, apps/admin, packages/ui required |
| Backend/data | One Supabase Postgres/Auth/Storage project shared by tenants WITHIN each environment |
| Environments | Separate Development and Production projects and credentials; local/emulated tests are not a third persistent environment |
| Data authorization | Postgres RLS + trusted server-side action guards, tenant-bound composite integrity |
| Identity | Supabase Auth authority; global verified email uniqueness and tenant-local usernames |
| Host identity | Trusted validated tenant subdomain on portal host; separate configured admin host |
| Interface | Arabic RTL initial; full English LTR; Dark/Light/System persisted per user |
| Testing | Unit, migration/RLS integration, adversarial auth/RBAC/storage, cross-app e2e, a11y, recovery drills |
| Deployment | Separate admin/portal deployments; DNS/TLS, mail provider, hosting, secret manager: configure after security/owner approval |
| Performance | Establish measured baseline before setting feature-specific thresholds; do not invent an SLA |

## Constitution Check (before design)

| Principle | Planned enforcement | Gate |
| --- | --- | --- |
| I/II: isolation and tenant lifecycle | Unique immutable subdomains; tenant composite FKs, strict RLS; host-bound identities; active/suspended checked on every protected operation | Cross-tenant & suspension suite |
| III/IV: auth and sessions | Supabase Auth, protected username/email lookup, atomic email reservations, invitation/reset state machines, independent session registry and enforcement | Provider-compatible proof for targeted and bulk revocation |
| V: roles | Tenant roles and multi-role union; separate protected manager authority; no actor self-role edits; no grants beyond authority; scoped categories | Deny-by-default privilege escalation suite |
| VI: privacy/audit | Event-category visibility, isolated platform audit, append-only privileged writes, scoped secure Storage | Audit and retention tests |
| VII: stack/layers | Two Next.js apps; UI sourced from packages/ui, no domain auth in UI primitives | Workspace lint/types/build/import checks |
| VIII- X: UX | Arabic/English, RTL/LTR, a11y, fixed global palette, per-tenant name/logo, optional secondary sidebar | WCAG 2.2 AA / i18n / white-label checks |
| XI/XII: controlled scope | Administrative foundation only; no invented domain dashboards or fields | Scope inspection |
| XIII/XIV: operations | Separate Supabase projects; migrations, 30-day daily DB+file backups, initial/quarterly isolated restore tests | Go-live hard gate |

**Blocking reconciliation:** Spec currently contains stale v1.0.0 references (introduction/assumptions), a stale same-email-across-tenants statement in its scope, and FR-010's obsolete wording. Constitution 2.0.0 and FR-013/CL-048 override those lines. Correct them in a separately reviewed spec amendment before implementation. The requirements checklist still lacks owner sign-off and marks G-02/G-03 decisions incomplete; creating this plan does not mark them approved.

## Project Structure

~~~text
apps/
  portal/
    src/app/                  # localized tenant routes, login, invitation, account, settings
    src/features/             # tenant UI compositions and server action orchestration
    src/lib/                  # portal-only guards and trusted host resolution
  admin/
    src/app/                  # distinct platform administration routes
    src/features/             # tenant lifecycle, manager controls, platform invitations
    src/lib/                  # platform-only privilege checks
packages/
  ui/                         # shared shadcn components, tokens, themes, navigation primitives
  auth/                       # server-safe Supabase identity/session adapters; no secrets in browser exports
  tenancy/                    # host validation, tenant context, tenant ownership contracts
  authorization/              # policy evaluation and typed permission vocabulary
  db/                         # generated DB types, validated queries, migration-facing helpers
  i18n/                       # Arabic/English dictionaries, locale/direction helpers
  config/                     # validated shared env/config schemas (no secret browser exports)
supabase/
  migrations/                 # version-controlled, reviewable schema and RLS changes
  tests/                      # SQL isolation, privilege and race tests
tests/
  e2e/                        # two-tenant and platform-admin browser flows
  security/                   # concurrency, session and unauthorized-access probes
  accessibility/              # automated + documented manual passes
docs/
  operations/                 # bootstrap, provisioning, release, backup, restore runbooks
pnpm-workspace.yaml
turbo.json
~~~

Package names are architectural proposals, not a mandate to create abstractions beyond their immediate requirements. Shared UI presentation stays independent of Supabase/business data.

## Phase 0 — Research and architecture proofs (no production code)

1. Verify Supabase Auth email/password, email verification and SSR PKCE flows: a tenant-bound server resolver converts a validated username into the account email without exposing the lookup; login always checks trusted host + Auth identity + staff/tenant authorization. Use normalized real addresses, not generated email aliases.
2. Prototype transactional email reservation and activation/reissue race safety (DB unique constraint + locked workflow/outbox) while recognizing Auth API and Postgres updates are NOT one database transaction. Design reconciliation and idempotency for partial failures.
3. Prove all mandated session semantics against Supabase Auth: 30-day verified-activity window; arbitrary other-session revocation; revoke all except current; reset/demotion revoke all; blocked refresh capability; active-token denial after tenant/account changes. No assumption that signOut alone invalidates an issued JWT.
4. Define the initial permission catalog, the manager/delegate grant ceiling and event-category audit filters for owner/security approval. Protected manager authority must NOT be an ordinary tenant-customizable permission.
5. Verify invitation and reset link issuance/reissue, provider token expiry versus stricter app-enforced expiry, successful email ownership verification, anti-enumeration and abuse limits, current provider plan features.
6. Verify domain/wildcard-TLS hosting and logo storage strategy, and price/feasibility for 30 consecutive daily DB + required file restore points and quarterly rehearsal.
7. Record findings, rejected alternatives, residual risks and explicit owner decisions in research.md. Stop affected implementation if a mandatory property lacks a verified approach.

## Phase 1 — Data model, interfaces, contracts

1. Produce tenant/platform/staff/role/session/audit/invitation conceptual-to-logical model in data-model.md, with constraints and ownership. No beneficiaries, donors, donations, volunteers or accounts tables.
2. Define trust boundaries and operation contracts in contracts/foundation-api.md. All tenant endpoints derive tenant context from trusted host; API body tenant_id is never authorization evidence.
3. Define the authorization matrix and invariant tests in contracts/security-matrix.md; install RLS on application-facing tenant tables and tenant-aware private Storage policies.
4. Document a repeatable local development/test walkthrough and acceptance gates in quickstart.md.
5. Design audit outbox/append-only admin events and retention: administrative 12 months; security 3 months; other categories only after approved policy. Keep platform audit separate; no indiscriminate business-read audit events.

## Phase 2 — Implementation slices (ordered; /speckit.tasks will decompose)

| Slice | Minimum deliverable | Main spec trace |
| --- | --- | --- |
| S0 | Monorepo, two app shells, packages/ui, fixed design tokens, lint/build/test pipelines | FR-038–042, FR-043 |
| S1 | Migrated tenant registry, immutable subdomain, verified host routing, provisioning/bootstrap runbooks | FR-001–007, FR-043 |
| S2 | Supabase staff identities, unique email reservations, seven-day invitation activation/reissue and username/email login | FR-008–017 |
| S3 | Rolling activity and targeted/multi-device revocation, password reset/recovery, suspended/disabled enforcement | FR-015, FR-018–022 |
| S4 | Multi-role authorization, protected manager appointments/removal, constrained delegated role/admin actions | FR-023–029 |
| S5 | Tenant/platform/security audit, scoped viewing/retention, settings/branding/private file rules | FR-030–037 |
| S6 | Complete AR/EN shell, theme/local preference, navigation and accessibility checks | FR-035–042 |
| S7 | Full two-tenant adversarial suite, migrations, operator runbooks, backups, recovery rehearsal and launch gate | FR-043–046, SC-001–010 |

S0–S1 can start after baseline review, but S2/S3/S4/S7 cannot be treated as secure or complete until their research/approval gates pass. Each slice includes tests, not a later security patch.

## Security architecture

- **Host trust:** exact configured platform host or approved portal base domain; reject unknown, spoofed, or malformed forwarded host. Normalize/validate subdomain and resolve tenant server-side. Never accept tenant_id from a browser as proof.
- **Identity boundary:** separate platform-admin records/privileges from tenant staff. Platform administrators cannot query tenant-private data by default. Supabase Auth verifies passwords; database stores identity references but never passwords.
- **DB boundary:** tenant-owned data has tenant_id and tenant-qualified relationship constraints; enable RLS; app-layer authorization and DB policy both check current tenant membership, account/tenant state, and live session authorization. Audit all privileged mutations server-side.
- **Sessions:** short JWT lifetime is defense in depth only. Active-session state must be consulted by protected operations, including applicable RLS paths; revocation and Auth refresh-token behavior need demonstrated integration before acceptance.
- **Roles:** effective union limited by tenant and record scope; no self-assignment, no editing a role assigned to actor, no archival while assigned; archived name reuse/restore rules; managers cannot be appointed/demoted via ordinary roles.
- **Storage:** separate public display logo delivery (if publicly served) from private tenant objects. Private file access requires verified tenant/permission/record context; no cross-tenant signed URLs/exports.
- **Audit:** immutable tenant/platform event streams, privileged append path, no user-driven delete; security events visible to active tenant managers only.

## Test and release gates

- Migration reset and RLS SELECT/INSERT/UPDATE/DELETE and tenant-qualified FK tests with two disjoint tenants; test anonymous and revoked sessions, service-key misuse guards, relationships, exports and file reads.
- Race tests: same email in two tenants, expiring/reissued invitations, duplicate usernames differing by case, grant/self-role edits, archive vs membership, last-manager revocation, reset and session refresh vs revocation.
- Session tests: different devices, activity at exact 30-day boundary, background token refresh does not update activity, targeted revocation, all-other, reset, password change, suspended/disabled/demoted accounts.
- AR/EN and RTL/LTR, System/Dark/Light, responsive/keyboard/screen-reader and WCAG 2.2 AA; provider-branding absence and neutral logo fallback.
- Production release MUST block until qualified operators verify two separate environments, migration rollback strategy, daily database and required-file recovery points over 30 days, isolated prelaunch restore, quarterly restore schedule, and approval of RPO/RTO and ownership.
- SC-001..SC-010 are acceptance evidence, not automatically satisfied by written design.

## Open decisions / blockers (owner or feasibility approval required)

- **SPEC-ALIGN:** Correct stale v1 email-sharing and ratification references in spec; project owner signs off spec/checklist.
- **AUTH-PROOF:** Determine provider-compatible mechanism for per-session refresh revocation (not just application denial), SSR cookie/security model, account verification, email reservation failure recovery, anti-abuse/IP quotas and delivery provider.
- **RBAC-APPROVAL:** Approve exhaustive foundation permission/action catalog and delegate grant-ceiling semantics; decide audit category-to-grant mapping.
- **BRANDING:** Owner approves precise accessible palette, logo mime/size/dimension constraints and safe public-display delivery.
- **OPERATIONS:** Choose portal/admin hostnames and DNS/TLS, compute/hosting, secrets/mail arrangements, backup method including Storage bytes, exact RPO/RTO, disaster runbook and responsible operators. Verify purchased Supabase capability.
- **NON-ADMIN RETENTION:** Specify other event categories and lawful hold/retention before emitting those event types.
- **POLICY COLLISION:** Decide whether platform-admin and tenant-staff emails may coincide, without violating global tenant-staff uniqueness or separate privilege boundaries.

## Complexity tracking

Additional server session registry and privileged adapters are intentional because the constitution requires immediate account/suspension/role revocation and tenant isolation even with previously issued JWTs. Dedicated auth/tenancy/authorization packages prevent divergent enforcement between two apps. Do not add an organization-per-database model, generic workflow engine, marketing site or speculative business modules.

## Deliverables for /speckit.tasks

This plan, research.md, data-model.md, foundation API and authorization contracts, and quickstart.md. /speckit.tasks must order proof gates ahead of dependent implementation and include traceability to FR/SC and negative security tests.
