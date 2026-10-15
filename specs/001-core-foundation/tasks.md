---

description: "Dependency-ordered implementation tasks for 001-core-foundation"
---

# Tasks: Core Foundation

**Input**: Design documents from `/specs/001-core-foundation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/foundation-api.md, contracts/security-matrix.md, quickstart.md
**Constitution**: `.specify/memory/constitution.md` v2.0.1 (authoritative; CL-048 global staff-email uniqueness)

**Tests**: REQUIRED. The spec (FR-046, SC-001..SC-010), the plan ("each slice includes tests, not a later security patch") and Constitution §XIV mandate positive and negative security, RLS, race, session, i18n/theme and accessibility tests. In every story phase, write the tests first and confirm they FAIL before you implement.

**Organization**: Tasks are grouped by user story (spec.md US1–US7, all P1, kept in spec order). Every story depends only on Phase 2 (Foundational) and can be tested on its own with the shared two-tenant fixtures. Proof and approval gates (plan Phase 0, research.md "Research gates") come before the implementation that depends on them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story this task belongs to (US1–US7)
- `(FR-xxx, CL-xxx, SC-xxx)`: traceability to spec requirements, clarifications and success criteria
- `⛔ GATE-xxx`: the task must not be merged as "secure/complete" until that gate is closed (see Gate Register)

## Conventions (apply to every task)

- **Workspace**: pnpm + Turborepo. Package scope is `@workspace/*` (neutral; never use a tenant or provider name such as ERAK/إراك as a package scope or default).
- **Migrations**: create each one with `supabase migration new <name>`. Paths below are written as `supabase/migrations/<ts>_<name>.sql`, where `<ts>` is the CLI-generated timestamp. Apply them in task order. Load the `supabase-postgres-best-practices` skill before you write or change SQL.
- **Schemas**: tenant and platform tables live in `public` with RLS **enabled and forced**. SECURITY DEFINER helpers live in a non-API-exposed `private` schema with `set search_path = ''`. RPCs callable by `authenticated` live in `public` and derive the actor from `auth.uid()` and the JWT `session_id` claim, never from a parameter. Anonymous-flow functions (login resolution, invitation and recovery redemption) are `private` and EXECUTE-granted to `service_role` only.
- **RLS style**: wrap `auth.uid()`/`auth.jwt()` as `(select auth.uid())`. Index every `tenant_id`/`staff_id` column used in policies.
- **Time authority**: the database `now()` decides expiry. A token is valid only when `now() < expires_at`. Boundary tests set `issued_at`/`expires_at` relative to `now()`.
- **Tokens**: generate them server-side (32 random bytes, base64url). Persist only SHA-256 hashes. Never log or audit raw tokens or passwords.
- **Errors**: use stable error codes and neutral, localized messages. Never reveal whether an account or email exists in another tenant (FR-014).
- **Unit tests**: Vitest, co-located as `*.test.ts`. **DB tests**: pgTAP under `supabase/tests/*.test.sql`, run with `supabase test db`. **Security/integration tests**: Vitest in `tests/security/` against local Supabase. **E2E/a11y**: Playwright in `tests/e2e/` and `tests/accessibility/`.

---

## Phase 1: Setup (Shared Infrastructure) — plan slice S0

**Purpose**: Monorepo, two app shells, shared UI package, toolchain and CI. No domain logic.

- [X] T001 Create root workspace manifests: `package.json` (private, pinned `packageManager` pnpm version, scripts `lint`, `typecheck`, `test`, `test:db`, `e2e`, `build`, `format`, `db:types` delegating to turbo/supabase), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (supported Node.js LTS), `.npmrc` (`strict-peer-dependencies=true`, `auto-install-peers=false`)
- [X] T002 Create `turbo.json` with `build`, `lint`, `typecheck`, `test` and `e2e` pipelines (correct `dependsOn: ["^build"]`, `outputs: [".next/**","!.next/cache/**","dist/**"]`, env passthrough limited to non-secret public vars)
- [X] T003 [P] Create `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `moduleResolution: "bundler"`, `verbatimModuleSyntax: true`. All apps/packages extend it (Constitution VII)
- [X] T004 [P] Create `eslint.config.mjs` (flat config: typescript-eslint strict-type-checked, `@next/eslint-plugin-next`, jsx-a11y). Add `no-restricted-imports` rules that (a) forbid `@workspace/auth/server/*`, `@workspace/config/server` and `server-only` modules in files with `"use client"`, (b) forbid `@supabase/*`, `@workspace/auth`, `@workspace/db` and `@workspace/authorization` inside `packages/ui/**`, (c) forbid direct `@radix-ui/*` imports in `apps/**` (FR-042)
- [X] T005 [P] Create `.prettierrc.json`, `.prettierignore`, `.editorconfig`, and `.gitignore` covering `node_modules`, `.next`, `.turbo`, `.env*` (except `.env.example`), `supabase/.temp`, `playwright-report`, `test-results`
- [X] T006 Scaffold `apps/portal` as a Next.js App Router app (TypeScript strict, `src/` dir, Tailwind CSS v4), package name `@workspace/portal`. Remove all default Next.js/Vercel assets and copy (`public/*.svg`, default favicon, default page text). Set `poweredByHeader: false` and `transpilePackages: ["@workspace/ui"]` in `apps/portal/next.config.ts` (Constitution IX)
- [X] T007 [P] Scaffold `apps/admin` the same way, package name `@workspace/admin`, with its own `apps/admin/next.config.ts` (`poweredByHeader: false`) and no default branding assets
- [X] T008 Create `packages/ui` as the shadcn monorepo UI package: `packages/ui/package.json` (exports `./components/*`, `./lib/*`, `./hooks/*`, `./styles/globals.css`), `packages/ui/components.json`, `packages/ui/src/lib/utils.ts` (`cn`), and `apps/portal/components.json` plus `apps/admin/components.json` whose `ui` alias points to `@workspace/ui/components`, so `shadcn add` writes only into `packages/ui` (FR-042, Constitution VII)
- [X] T009 [P] Create package skeletons, each with `package.json`, `tsconfig.json`, `src/index.ts`, `vitest.config.ts`: `packages/auth`, `packages/tenancy`, `packages/authorization`, `packages/db`, `packages/i18n`, `packages/config`. Add the `server-only` dependency to `packages/auth` and `packages/config`. Expose `./server` subpath exports separately from browser-safe exports
- [X] T010 [P] Create root `vitest.workspace.ts` (packages + `tests/security`) and `playwright.config.ts` with projects `portal-tenant-a`, `portal-tenant-b` and `admin`, whose base URLs come from `E2E_TENANT_A_URL`, `E2E_TENANT_B_URL` and `E2E_ADMIN_URL`
- [X] T011 Initialize local Supabase in `supabase/config.toml` (`supabase init`). Disable public signup (`[auth] enable_signup = false`; admin API user creation still works). Enable refresh-token rotation. Set `jwt_expiry` to the short value recorded in research.md R-03 (proposal 300s, defense in depth only). Set `site_url`/`additional_redirect_urls` for `http://*.portal.localhost:3000` and `http://admin.localhost:3001`. Enable the local mail catcher (Inbucket/Mailpit). Set the password policy recorded in research.md R-02 (FR-016)
- [X] T012 [P] Document local hosts in `docs/operations/local-development.md`: tenant hosts `<subdomain>.portal.localhost:3000` and admin host `admin.localhost:3001` (`*.localhost` resolves to loopback, so no hosts-file edits). Cover `supabase start`, `supabase db reset` and mail-catcher URL usage. Never use Production keys locally (FR-043)
- [X] T013 [P] Create `apps/portal/.env.example` and `apps/admin/.env.example` listing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public), `SUPABASE_SECRET_KEY` (server-only, marked "never NEXT_PUBLIC"), `APP_ENV`, `PORTAL_BASE_DOMAIN` (portal), `ADMIN_HOST` (admin), `TRUSTED_PROXY_HOPS` and `AUTH_THROTTLE_HMAC_KEY` (server-only), with comments that real values live outside version control
- [X] T014 [P] Create the CI workflow `.github/workflows/ci.yml`: `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `supabase start`, `supabase db reset`, `supabase test db`, `pnpm e2e`. It uses no Production secrets and pins action versions
- [X] T015 [P] Create `scripts/check-client-bundles.mjs`. It fails if any file under `apps/*/.next/static/**` contains `SUPABASE_SECRET_KEY`, a JWT whose decoded role is `service_role`, or a module path from `@workspace/auth/server` or `@workspace/config/server`. Wire it into `.github/workflows/ci.yml` after `pnpm build` (FR-017, Constitution XIV-7)
- [X] T016 [P] Create `scripts/check-ui-boundaries.mjs`. It fails if `apps/*/src/components/ui/` exists, if an app imports `@radix-ui/*` directly, or if `packages/ui/src/**` imports Supabase, auth, db or authorization packages. Wire it into `pnpm lint` (FR-042, Constitution XIV-8)

**Checkpoint**: `pnpm install && pnpm lint && pnpm typecheck && pnpm build` succeed for empty apps and packages.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Proof gates, core schema/RLS, trusted host resolution, Supabase adapters, the live-session guard pipeline, the authorization evaluator, the append-only audit writer, the email-reservation and invitation-issuance core, i18n/UI base and test fixtures. Every user story depends on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. Security-sensitive stories (US2, US3, US4, US7) cannot be accepted until their gates in 2A are closed.

### 2A — Proof gates and decision records (plan Phase 0 / research.md "Research gates")

- [x] T017 GATE-SPEC: Prepare a reviewed amendment to `specs/001-core-foundation/spec.md` that (a) changes "Constitution v1.0.0" to v2.0.1 in the header **Input** line and in Assumptions, (b) replaces the In-scope bullet "Independent staff accounts per tenant, even when the same human email is reused by another tenant" with the CL-048 global-uniqueness statement, (c) rewrites FR-010's first two sentences so emails are globally unique (consistent with FR-013) while usernames stay tenant-local, and (d) appends a Clarification Record entry. Submit it for project-owner sign-off and leave `checklists/requirements.md` approval boxes for the owner
- [ ] T018 GATE-AUTH proof R-03 (sessions): write `tests/proofs/session-revocation.proof.test.ts` against local Supabase. It must show that (1) the access-token `session_id` claim identifies a provider session, (2) deleting a single `auth.sessions` row through a SECURITY DEFINER function or `auth.admin.signOut(jwt,'local')` blocks refresh for that session only, (3) `scope:'others'` keeps the current session, (4) an already-issued access token still verifies until expiry, which proves the registry check is needed, and (5) refresh racing revocation never resurrects a session. Record the method and results in `specs/001-core-foundation/research.md` under R-03 "Proof results" (FR-018–FR-022, CL-026/038/039)
- [ ] T019 [P] GATE-AUTH proof R-01 (global email reservation): write `tests/proofs/email-reservation.proof.test.ts` that prototypes an advisory-lock reservation in a scratch schema and fires 20 concurrent claims for one normalized email from two tenants, asserting exactly one success. It also simulates an Auth Admin `createUser` failure after a reservation and shows reconciliation leaves no usable access. Record the approved normalization (trim + lowercase full address, no dot/plus stripping, no alias generation) in research.md R-01 (FR-013, CL-048)
- [ ] T020 [P] GATE-AUTH proof R-02 (login, verification, password confirmation, email immutability): write `tests/proofs/auth-flows.proof.test.ts`. It must show that (1) a service-role-only username→email resolver plus `signInWithPassword` yields uniform failures, (2) redeeming an emailed single-use token followed by `auth.admin.createUser({email_confirm:true})` is acceptable proof of mailbox ownership, (3) a manager's own-password check through a throwaway non-persisting client leaves no lingering session (immediately revoke the created session), (4) a `BEFORE UPDATE OF email, email_change ON auth.users` trigger blocks `auth.updateUser({email})` for linked staff, (5) the response-time distributions of the uniform sign-in failure paths, from which the timing tolerance used by T102 is set, and (6) which client IP Supabase Auth's rate limits see when sign-in is proxied through the Next.js server. Record results, the tolerance and the password policy in research.md R-02. Also draft `docs/decisions/auth-abuse-controls.md` for owner approval: per-(tenant, identifier) and per-client-IP limits for sign-in and public recovery, the throttled response (identical to other failures) and throttle-data retention; mark it "PENDING OWNER APPROVAL" ⛔ GATE-ABUSE (FR-012, FR-014, FR-015, CL-012, CL-015)
- [ ] T021 [P] GATE-RBAC: Draft `docs/decisions/permission-catalog.md` for owner approval:
  - **Tenant-grantable keys**: `staff.view`, `staff.invite`, `staff.disable`, `staff.enable`, `staff.roles.assign`, `roles.view`, `roles.create`, `roles.update`, `roles.archive`, `roles.restore`, and `audit_logs.view` with category list `staff|invitations|roles|tenant_settings|sessions`.
  - **Manager-only non-grantable authorities**: tenant branding edit (FR-036), Security Log view (CL-035), invitation resend (FR-009), manager-assisted password reset (CL-015).
  - **Platform capabilities**: `tenants.manage`, `tenants.managers.manage`, `tenants.staff.manage`, `platform_admins.invite`, `platform_audit.view`.
  - **Grant ceiling**: an actor may confer a grant only if they hold the same key with scope `all` or the identical scope, and only audit categories they hold.
  - **Open questions to flag**: last-manager rule for suspended tenants, and platform-initiated staff reset mirroring CL-015.

  Mark the document "PENDING OWNER APPROVAL" (FR-027, CL-030, CL-032)
- [ ] T022 [P] GATE-BRAND: Draft `docs/decisions/branding.md` for owner approval, starting from `docs/design-references/README.md`:
  - The fixed light/dark palette from that README, including its contrast fixes, the new `--on-accent` and `--input-border` tokens, and focus tokens. All must meet WCAG 2.2 AA. The per-theme accent (green in Dark, teal in Light) is an owner decision (2026-10-15).
  - Fonts: Cairo for Arabic and Inter for English/Latin (owner decision 2026-10-15), self-hosted via `next/font/google`.
  - Organization display-name constraints.
  - Logo MIME allowlist (proposal: PNG/JPEG/WebP; SVG excluded for script risk), maximum bytes and pixel dimensions.
  - Delivery through a portal route from a private bucket.

  Mark it "PENDING OWNER APPROVAL" (FR-035–FR-037, Constitution IX)
- [ ] T023 [P] GATE-OPS: Draft `docs/decisions/operations.md` for owner and operator approval. It covers portal base domain and admin hostname, wildcard DNS/TLS, hosting for two separate deployments, mail transport, secret manager, the purchased Supabase plan's backup/PITR capability, the Storage-bytes backup method, RPO/RTO, responsible operators and the quarterly rehearsal calendar (FR-043–FR-045, CL-045–CL-047)
- [ ] T024 [P] GATE-COLLIDE: Draft `docs/decisions/platform-staff-email-collision.md`. Explain that Supabase Auth enforces one identity per email per project, and propose the safe default: an email cannot belong to both a platform admin and a tenant staff account, enforced in the database. Mark it pending owner decision (plan "POLICY COLLISION")
- [ ] T025 Update the "Research gates" checklist in `specs/001-core-foundation/research.md` with links to T018–T024 outputs. Add an explicit stop rule: if a proof fails, pause the dependent tasks listed in the Gate Register and request an approved alternative

### 2B — Core database schema and RLS

- [ ] T026 Create migration `supabase/migrations/<ts>_foundation_base.sql` with:
  - The `private` schema (no API exposure; `revoke all on schema private from anon, authenticated`) and the `pgcrypto` and `pg_cron` extensions.
  - Enums: `tenant_state ('active','suspended')`, `record_scope ('all','own','assigned')`, `session_revoked_reason ('user','user_all_others','password_change','recovery','admin_reset','disabled','manager_demoted','platform_revoked','sign_out')`.
  - `private.normalize_email(text)`, implementing exactly the R-01 rule from T019.
  - `private.reserved_subdomains(name text primary key)`, seeded with `admin`, `www`, `api`, `app`, `mail`, `smtp`, `auth`, `static`, `assets`, `portal`, `status`, `support`.
- [ ] T027 Create migration `supabase/migrations/<ts>_tenants.sql` for `public.tenants`:
  - Columns: `id uuid pk default gen_random_uuid()`, `display_name text not null check (char_length(btrim(display_name)) > 0)`, `subdomain text not null unique check (subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$')`, `state tenant_state not null default 'active'`, `logo_object_path text null`, `logo_version int not null default 0`, `created_at`, `updated_at`.
  - A BEFORE INSERT trigger that rejects reserved subdomains.
  - A BEFORE UPDATE trigger that raises if `id` or `subdomain` changes (FR-005, CL immutability).
  - RLS enabled and forced, with no direct anon/authenticated policies yet; no DELETE grant to anyone (FR-007).
- [ ] T028 Create migration `supabase/migrations/<ts>_platform_admins.sql` with:
  - `public.platform_admins`: `auth_user_id uuid pk references auth.users`, `enabled bool not null default true`, `capabilities text[] not null check (capabilities <@ array['tenants.manage','tenants.managers.manage','tenants.staff.manage','platform_admins.invite','platform_audit.view'])`, `created_via text check in ('bootstrap','invitation')`, `created_at`.
  - `private.platform_bootstrap_state`, a single-row table (`id boolean primary key default true check (id)`, `bootstrapped_at`, `operator_ref`) (CL-043).
  - RLS forced; self-row SELECT only.
  - A trigger that rejects an `auth_user_id` already linked to `tenant_staff`. This is the GATE-COLLIDE default ⛔ GATE-COLLIDE.
- [ ] T029 Create migration `supabase/migrations/<ts>_tenant_staff.sql` for `public.tenant_staff`. Rows exist only for activated accounts.
  - Columns: `id uuid pk`, `tenant_id uuid not null references tenants`, `auth_user_id uuid not null unique references auth.users`, `email text not null`, `email_normalized text not null unique` (global, including disabled, CL-048), `username text not null check (char_length(username) between 3 and 30 and username ~ '^[A-Za-z]+(?:[._][A-Za-z]+)*$')`, `username_normalized text generated always as (lower(username)) stored`, `enabled bool not null default true`, `activated_at timestamptz not null`, `created_at`.
  - Constraints: `unique (tenant_id, id)` as a composite-FK target, and `unique (tenant_id, username_normalized)` (FR-010, CL-007–CL-010).
  - A BEFORE UPDATE trigger that rejects changes to `tenant_id`, `auth_user_id`, `email` and `email_normalized` (CL-012).
  - No DELETE grant; history is retained.
- [ ] T030 Create migration `supabase/migrations/<ts>_email_reservations.sql`:
  - `public.email_reservations`: `email_normalized text pk`, `tenant_id`, `invitation_id`, `expires_at`, `created_at`.
  - `private.claim_email_reservation(p_tenant_id uuid, p_email_normalized text, p_invitation_id uuid, p_expires_at timestamptz) returns boolean`. It takes `pg_advisory_xact_lock(hashtextextended('email:'||p_email_normalized,0))` and returns false if any `tenant_staff.email_normalized` matches or an unexpired reservation belongs to a different invitation. It replaces an expired reservation, upserts for the same invitation, and never reveals the owning tenant (FR-013, CL-048).
  - RLS forced; no client access.
- [ ] T031 Create migration `supabase/migrations/<ts>_rbac.sql` with:
  - `public.permission_catalog` (`key text pk`, `resource`, `action`, `supports_scopes record_scope[]`, `tenant_grantable bool`, `description`), seeded from the T021 draft ⛔ GATE-RBAC.
  - `public.roles` (`id`, `tenant_id`, `name`, `name_normalized text generated always as (lower(btrim(name))) stored`, `description`, `archived_at timestamptz null`, `created_at`, `updated_at`, `unique(tenant_id,id)`) plus a partial unique index on `(tenant_id, name_normalized) where archived_at is null` (CL-031).
  - `public.permission_grants` (`tenant_id`, `role_id`, `permission_key references permission_catalog`, `scope record_scope not null default 'all'`, `audit_categories text[] null`, with a check that `audit_categories` is only non-null for `audit_logs.view`), with a composite FK `(tenant_id, role_id) → roles(tenant_id,id)` and a trigger rejecting keys where `tenant_grantable = false`.
  - `public.staff_roles` (`tenant_id`, `staff_id`, `role_id`, `assigned_by_staff_id`, `assigned_at`, pk `(staff_id, role_id)`), with composite FKs to `tenant_staff(tenant_id,id)` and `roles(tenant_id,id)` and a trigger rejecting assignment of archived roles (CL-029).
  - `public.tenant_manager_grants` (`id`, `tenant_id`, `staff_id`, `granted_by_platform_admin uuid not null`, `granted_at`, `revoked_at`, `revoked_by_platform_admin`), with a composite FK and a partial unique `(tenant_id, staff_id) where revoked_at is null` (CL-023).
  - RLS forced on all tables.
- [ ] T032 Create migration `supabase/migrations/<ts>_session_registry.sql` for `public.session_registry`:
  - Columns: `id uuid pk`, `provider_session_id uuid not null unique`, `auth_user_id uuid not null`, `tenant_id uuid null`, `staff_id uuid null`, `platform_admin_id uuid null`, a check that exactly one owner kind is set, a composite FK `(tenant_id, staff_id)`, `created_at`, `verified_activity_at timestamptz not null`, `revoked_at`, `revoked_reason session_revoked_reason`, `device_type text`, `browser text`. There are NO IP, geolocation or user-agent-string columns (CL-037).
  - `private.current_session_is_live() returns boolean`, keyed on `(select auth.jwt()->>'session_id')::uuid`. It requires the same `auth_user_id`, `revoked_at is null` and `verified_activity_at > now() - interval '30 days'` (FR-018).
  - `private.revoke_sessions(p_session_ids uuid[], p_reason session_revoked_reason)`, which sets `revoked_at` and deletes the matching `auth.sessions` rows in the same transaction, using the method proven in T018 ⛔ GATE-AUTH.
- [ ] T033 Create migration `supabase/migrations/<ts>_audit.sql` with:
  - `public.tenant_audit_events` (`id bigint generated always as identity`, `tenant_id`, `actor_kind text check in ('staff','platform_admin','system')`, `actor_staff_id`, `actor_platform_admin_id`, `category text not null`, `event text not null`, `resource_type`, `resource_id`, `occurred_at default now()`, `metadata jsonb not null default '{}'`).
  - `public.tenant_security_events` (`id`, `tenant_id`, `actor_staff_id null`, `event text`, `occurred_at`, `metadata jsonb`).
  - `public.platform_audit_events` (`id`, `actor_platform_admin_id null`, `actor_operator_ref null`, `event`, `occurred_at`, `metadata jsonb`).
  - `public.audit_legal_holds` (`id`, `target text check in ('tenant_audit','tenant_security','platform_audit')`, `tenant_id null`, `category null`, `from_ts`, `until_ts`, `approved_by`, `created_at`).
  - REVOKE UPDATE/DELETE/TRUNCATE from anon, authenticated and service_role, plus BEFORE UPDATE/DELETE triggers that raise unless the transaction-local flag `app.retention_purge = 'on'` is set (FR-032).
  - `private.sanitize_audit_metadata(jsonb)`, which drops keys matching `(?i)(password|token|secret|key|otp|code)`.
  - Append-only SECURITY DEFINER writers `private.write_tenant_audit(...)`, `private.write_security_event(...)` and `private.write_platform_audit(...)` (FR-030, Constitution VI).
- [ ] T034 Create migration `supabase/migrations/<ts>_rls_helpers.sql` with STABLE SECURITY DEFINER helpers:
  - `private.current_staff()`: the staff row for `auth.uid()`.
  - `private.request_context_ok()`: staff enabled, tenant `active`, and `current_session_is_live()` (FR-006, FR-022).
  - `private.has_permission(p_key text, p_scope record_scope default null)`: the union over the actor's non-archived roles' grants, gated by `request_context_ok()` (FR-024, FR-025).
  - `private.audit_categories_for_actor()`.
  - `private.is_active_tenant_manager()`: an unrevoked manager grant and `request_context_ok()`.
  - `private.is_platform_admin(p_capability text)`: enabled admin with the capability and a live platform session.
  - `private.rbac_lock(p_tenant_id)`: `pg_advisory_xact_lock(hashtextextended('rbac:'||p_tenant_id,0))`, used by every role, membership and role-bearing invitation mutation.
  - `private.actor_can_grant(p_key, p_scope, p_audit_categories) returns boolean`: a manager may grant any `tenant_grantable` key; otherwise the actor must hold the same key with scope `all` or the identical scope, plus a superset of the audit categories. Per T021 ⛔ GATE-RBAC.
  - `private.actor_can_grant_role(p_role_id)`: the role is active and in the actor's tenant, and all of its grants pass `actor_can_grant`. Shared by US2 invitations and US4 role administration (FR-026).
- [ ] T035 Create migration `supabase/migrations/<ts>_rls_policies_core.sql`. It defaults to deny and adds SELECT policies for:
  - `tenant_staff`: own row, or `has_permission('staff.view')` within the same tenant.
  - `roles`, `permission_grants`, `staff_roles`: same tenant with `roles.view`/`staff.view`, or own memberships.
  - `session_registry`: own rows only.
  - `tenants`: own tenant row.
  - `platform_admins`: self.

  It adds no INSERT/UPDATE/DELETE policies for `authenticated` on core tables, because all mutations go through RPCs. It adds supporting indexes on every policy column (FR-004, Constitution I)
- [ ] T036 [P] Create migration `supabase/migrations/<ts>_storage_buckets.sql`. It creates private buckets `tenant-logos` and `tenant-private` (`public = false`) with `storage.objects` policies:
  - No anon access.
  - Authenticated SELECT on `tenant-private` only when `(storage.foldername(name))[1] = private.current_staff().tenant_id::text` and `request_context_ok()` hold.
  - `tenant-logos` writable and readable only through server-side service-role code.

  (FR-034, Constitution VI)
- [ ] T037 Generate DB types into `packages/db/src/types.gen.ts` with `supabase gen types typescript --local`. Export a typed `Database` from `packages/db/src/index.ts`. Add a CI step to `.github/workflows/ci.yml` that fails when the generated types are stale
- [ ] T038 [P] Write pgTAP `supabase/tests/000_rls_baseline.test.sql`. It asserts that every `public` table has RLS enabled and forced, that `anon` has no table privileges, that every SECURITY DEFINER function has a fixed `search_path`, and that no `private` function is executable by `anon`/`authenticated` unless allowlisted (Constitution I, XIV-4)
- [ ] T039 [P] Write pgTAP `supabase/tests/001_tenant_integrity.test.sql`. It asserts that:
  - Composite FKs block linking tenant-A staff to tenant-B roles.
  - Subdomain and tenant_id updates are rejected.
  - Reserved and invalid subdomains are rejected.
  - Email updates on `tenant_staff` are rejected.
  - Username rules hold: lengths 2 and 31 fail; 3 and 30 pass; `ahmed`, `ahmed_ali` and `ahmed.ali` pass; `ahmed123`, Arabic, space, hyphen, `.ahmed`, `ahmed.`, `ahmed..ali`, `ahmed__ali` and `ahmed._ali` fail.
  - `Ahmed`/`ahmed` cannot coexist in one tenant but may exist across tenants.
  - Global email uniqueness holds, including disabled staff.

  (FR-005, FR-010, FR-013, CL-007–CL-012)
- [ ] T040 [P] Write pgTAP `supabase/tests/002_audit_append_only.test.sql`. It asserts that UPDATE/DELETE/TRUNCATE on all audit tables fail for `authenticated` and `service_role`, that the writers strip secret-like metadata keys, and that only the writers can insert (FR-032, Constitution VI)
- [ ] T041 [P] Write pgTAP `supabase/tests/003_session_liveness.test.sql`. `current_session_is_live()` must be false for a revoked row, for `verified_activity_at = now() - interval '30 days'`, for a mismatched `auth.uid()` and for a missing row, and true at `now() - interval '29 days 23 hours'` (FR-018, FR-022)

### 2C — Core server packages (tenancy, auth adapters, authorization, audit, invitations core)

- [ ] T042 [P] Implement `packages/config/src/server.ts` (`import 'server-only'`) and `packages/config/src/client.ts` with zod-validated env. The server env adds `SUPABASE_SECRET_KEY`, `APP_ENV` (`development|production|test`), `PORTAL_BASE_DOMAIN`, `ADMIN_HOST`, `TRUSTED_PROXY_HOPS` and `AUTH_THROTTLE_HMAC_KEY`; the client env exposes only `NEXT_PUBLIC_SUPABASE_URL` and the anon key. Fail fast on a missing or invalid value (Constitution III, VII)
- [ ] T043 [P] Implement `packages/config/src/logger.ts`: a structured server logger that redacts keys/values matching password, token, secret, authorization, cookie, `sb-` cookies and JWT-shaped strings, and never logs request bodies of auth routes (FR-017)
- [ ] T044 [P] Implement `packages/tenancy/src/subdomain.ts` (`validateSubdomain()`: DNS-label rules identical to the T027 check, lowercase only, reserved list in `packages/tenancy/src/reserved-subdomains.ts` mirroring `private.reserved_subdomains`) and `packages/tenancy/src/host.ts` (`classifyHost(headers, config)`). `classifyHost` reads `host`, honours `x-forwarded-host` only when `TRUSTED_PROXY_HOPS > 0`, lowercases, strips the port and trailing dot, and rejects IP literals, punycode/IDN, nested labels and unknown base domains. It returns `{kind:'tenant', subdomain} | {kind:'admin'} | {kind:'invalid'}` (FR-004, contracts "Host trust")
- [ ] T045 [P] Write unit tests `packages/tenancy/src/host.test.ts` and `packages/tenancy/src/subdomain.test.ts` covering spoofed `X-Forwarded-Host` without trusted proxy, uppercase host, port, trailing dot, `a.b.<base>`, IP literal, admin host presented to the portal classifier, reserved names, and leading/trailing hyphen (security-matrix test 10)
- [ ] T046 Implement `packages/tenancy/src/server/resolve-tenant.ts` (`import 'server-only'`): `resolveTenantFromHost()` wrapped in React `cache()`. It reads `{id, displayName, state, logoVersion}` by subdomain with the service-role client and returns `null` for an unknown host, so callers render a neutral 404 with no tenant metadata (FR-004)
- [ ] T047 Implement `packages/auth/src/server/supabase.ts`: `createSupabaseServerClient()` using `@supabase/ssr` `createServerClient` with Next.js `cookies()`. Cookies are host-only (no `Domain` attribute, so sessions never span tenant subdomains), `httpOnly`, `secure` outside development, `sameSite: 'lax'`, and use a distinct cookie name prefix per app (`portal`/`admin`) (FR-004, Constitution III)
- [ ] T048 [P] Implement `packages/auth/src/server/supabase-admin.ts` (`import 'server-only'`): a lazily created service-role client with `auth.persistSession=false` and `autoRefreshToken=false`, exported only from the `./server` entry (Constitution VII)
- [ ] T049 Implement `packages/auth/src/server/session-registry.ts`:
  - `registerSession({ supabase, owner, userAgent })` reads the verified `session_id` claim via `supabase.auth.getClaims()` and stores coarse device type and browser parsed with `ua-parser-js`, falling back to `null`; it stores no IP or location (CL-037).
  - `revokeSessions(filter, reason)` calls `private.revoke_sessions` through the service role.

  Depends on T018 ⛔ GATE-AUTH
- [ ] T050 Implement `packages/auth/src/server/context.ts`:
  - `getTenantStaffContext(hostTenant)` verifies the JWT (`getClaims()`), loads the staff row by `auth.uid()`, requires `staff.tenant_id === hostTenant.id` (otherwise treat as unauthenticated without disclosure), the tenant `active`, staff `enabled`, and the registry session live.
  - `getPlatformAdminContext()` performs the equivalent platform checks.
  - Both throw typed `AuthError` codes (`unauthenticated|forbidden|suspended|session_expired`) (contracts "Trust boundary", FR-006, FR-022).
- [ ] T051 Implement `packages/authorization/src/catalog.ts`: typed `PermissionKey`, `RecordScope`, `AuditCategory` and `PLATFORM_CAPABILITIES`, matching the `permission_catalog` seed. Implement `packages/authorization/src/evaluate.ts`: `loadEffectivePermissions(ctx)` per request via RPC `public.my_effective_permissions()` (add it to a new migration `supabase/migrations/<ts>_effective_permissions_rpc.sql`, returning `key, scope, audit_categories` and `is_manager`), plus `can(perms, key, scope?)`. Implement `packages/authorization/src/grant-ceiling.ts` as a pure `canGrant(actorPerms, requestedGrants)` mirroring the T021 ceiling rule ⛔ GATE-RBAC
- [ ] T052 [P] Write unit tests `packages/authorization/src/grant-ceiling.test.ts` (scope all vs own vs assigned, audit-category subset, non-grantable keys, manager authority never grantable) and `packages/authorization/src/catalog.test.ts`, a parity check between the TS catalog and the generated DB types/seed. Add pgTAP `supabase/tests/005_grant_ceiling.test.sql` with the same cases against `private.actor_can_grant` and `private.actor_can_grant_role`; the SQL functions are authoritative and the TS version only drives UI hints (FR-026, FR-027)
- [ ] T053 [P] Implement `packages/auth/src/server/audit.ts`: typed wrappers `recordTenantAudit`, `recordSecurityEvent` and `recordPlatformAudit` (event names as string-literal unions) that call the private writers through the service role, used only for events that originate outside an RPC (e.g., failed sign-in) (FR-030, FR-033)
- [ ] T054 [P] Implement `packages/auth/src/email/normalize.ts`, identical to `private.normalize_email`, with the parity test `packages/auth/src/email/normalize.test.ts` (FR-013)
- [ ] T055 [P] Implement `packages/auth/src/tokens.ts`: `generateToken()` (32 bytes, base64url), `hashToken()` (SHA-256 hex) and `timingSafeEqualHex()`. Add `packages/auth/src/tokens.test.ts`
- [ ] T056 Implement the `packages/auth/src/email/mailer.ts` `Mailer` interface with `SmtpMailer` (local mail catcher for dev/test). The production adapter throws `MAIL_TRANSPORT_NOT_CONFIGURED` until GATE-OPS selects a transport. Add AR/EN templates `packages/auth/src/email/templates/staff-invitation.ts`, `platform-invitation.ts` and `password-reset.ts` that render only the tenant display name (platform template: neutral wording), with no provider name, logo or "Powered by" (FR-037, Constitution IX)
- [ ] T057 Create migration `supabase/migrations/<ts>_staff_invitations.sql`:
  - `public.staff_invitations`: `id`, `tenant_id`, `recipient_email`, `recipient_email_normalized`, `grants_manager bool not null default false`, `invited_by_staff_id null`, `invited_by_platform_admin_id null`, `state text check in ('pending','redeemed')`, `redeemed_staff_id null`, `created_at`, `unique(tenant_id,id)`.
  - `public.staff_invitation_roles`: `tenant_id`, `invitation_id`, `role_id`, with composite FKs.
  - `public.staff_invitation_links`: `id`, `tenant_id`, `invitation_id`, `token_hash text unique not null`, `kind text check in ('initial','resend')`, `issued_at`, `expires_at` (always `issued_at + interval '168 hours'`), `consumed_at`, `superseded_at`.
  - `private.issue_staff_invitation(p_tenant_id, p_email, p_role_ids, p_grants_manager, p_actor_staff_id, p_actor_platform_admin_id, p_token_hash) returns uuid`. It calls `claim_email_reservation` and raises the neutral `email_unavailable` on conflict; it performs no authorization (callers do).
  - RLS forced; no direct client access.
  - There is NO cancel function (FR-009, CL-003, CL-020).
- [ ] T058 Implement `packages/auth/src/server/invitations/issue.ts`, the server helper used by both apps. It generates the token, calls the given authorized RPC with `hashToken(token)`, builds the link `https://<subdomain>.<PORTAL_BASE_DOMAIN>/invite/accept?token=…` and sends the tenant-branded email in the inviter's locale. If sending fails, it records `invitation.delivery_failed` with no token in metadata, and the invitation stays valid for authorized resend (FR-009)
- [ ] T059 [P] Write pgTAP `supabase/tests/004_email_reservation.test.sql`. Claims succeed. A same-email claim from another tenant fails with no tenant info. An existing disabled staff email blocks. An expired unredeemed reservation is released and reclaimable. Issuing for an email already used by staff fails, whether that account is activated or disabled. A second invitation or account with the same email in the same tenant is denied. Case and normalization variants (e.g. ` Ahmed@Example.ORG` vs `ahmed@example.org`) cannot bypass the check. These are the tests Constitution v2.0.1 requires for CL-048 (FR-013, CL-048)
- [ ] T060 [P] Write `tests/security/email-reservation-race.test.ts`: 20 parallel `private.issue_staff_invitation` calls for one email across tenants A/B yield exactly one pending invitation (SC-003, CL-048)

### 2D — Test harness, i18n and UI base

- [ ] T061 Create `tests/helpers/env.ts`, which refuses to run unless the Supabase URL host is `127.0.0.1`/`localhost` and `APP_ENV=test` (FR-043). Create `tests/helpers/fixtures.ts` with `createTwoTenantFixture()`: tenants A and B, platform admin with all capabilities, one activated manager and ordinary staff per tenant (Auth admin API + `tenant_staff` rows + manager grants), sample roles with grants, a `signIn(staff)` helper that registers sessions, and teardown
- [ ] T062 [P] Implement `packages/i18n`:
  - `src/config.ts`: locales `['ar','en']`, default `'ar'`, `dir()` returning `rtl|ltr`.
  - `src/dictionaries/ar.ts` and `src/dictionaries/en.ts`, typed with `satisfies Dictionary`.
  - `src/get-dictionary.ts`.
  - `src/resolve-locale.ts`: stored user preference → `locale` cookie → `'ar'`.
  - `src/format.ts`: centralized `Intl` date/number formatting with an explicit locale, no currency inference (Constitution VIII).
- [ ] T063 [P] Write `packages/i18n/src/dictionaries.test.ts`: AR and EN key sets are identical with no empty values (FR-038)
- [ ] T064 [P] Implement design tokens in `packages/ui/src/styles/globals.css`. Tailwind v4 `@theme inline` CSS variables hold the fixed palette (light under `:root`, dark under `.dark`), typography, radii, spacing and focus-ring tokens, and `prefers-reduced-motion` rules. Use the palette in `docs/design-references/README.md` (via `docs/decisions/branding.md`), with `--font-arabic` (Cairo) and `--font-latin` (Inter) font-family tokens; Arabic text uses Cairo first and Latin text uses Inter first. Add no tenant overrides ⛔ GATE-BRAND (final values) (FR-037, Constitution VII)
- [ ] T065 [P] Add shadcn primitives into `packages/ui/src/components/` via the monorepo-aware CLI: button, input, label, form, dialog, alert-dialog, table, select, checkbox, dropdown-menu, sonner, sidebar, sheet, badge, card, separator, skeleton, tooltip, tabs, pagination. Convert any physical direction utilities (`ml/mr/pl/pr/left/right`) to logical ones (`ms/me/ps/pe/start/end`) for RTL (FR-041, FR-042)
- [ ] T066 [P] Create presentational components in `packages/ui/src/components/`:
  - `packages/ui/src/components/tenant-identity.tsx`: name plus optional `logoSrc`, with a neutral accessible icon fallback and alt text.
  - `packages/ui/src/components/app-shell.tsx`: primary sidebar, optional secondary sidebar slot (rendered only when a module has subsections), header slot with title/breadcrumb, and an off-canvas drawer on mobile. The general idea follows the non-binding `docs/design-references/README.md` "Shell idea"; it adds no business modules.
  - `packages/ui/src/components/ltr-text.tsx`: `<bdi dir="ltr">` for usernames/emails/IDs.
  - `packages/ui/src/components/theme-select.tsx` and `language-select.tsx`: controlled, with no persistence logic.

  These components contain no Supabase or authorization code (FR-035, FR-040, Constitution VII)
- [ ] T067 Implement root layouts `apps/portal/src/app/layout.tsx` and `apps/admin/src/app/layout.tsx`. They set `<html lang dir>` from `resolveLocale()`, import `@workspace/ui/styles/globals.css`, load Cairo (subsets `arabic`, `latin`) and Inter (subset `latin`) with `next/font/google` as CSS variables bound to the `--font-arabic`/`--font-latin` tokens, wrap content in `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`), and use neutral metadata with no provider name or default icons (FR-038, FR-039, Constitution IX)
- [ ] T068 Implement `apps/portal/src/middleware.ts`. Use `classifyHost` and return a neutral localized 404 for any non-tenant host. Run the `@supabase/ssr` cookie refresh pattern WITHOUT touching session activity (CL-036). Set security headers (`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, baseline CSP) (FR-004)
- [ ] T069 [P] Implement `apps/admin/src/middleware.ts`. Accept only the exact `ADMIN_HOST` and give tenant subdomains and unknown hosts a neutral 404. Use the same cookie-refresh behaviour with the admin cookie prefix and the same security headers (FR-001, Constitution VII)
- [ ] T070 [P] Create neutral, localized `not-found.tsx`, `error.tsx` and `loading.tsx` in `apps/portal/src/app/` and `apps/admin/src/app/`, with no provider branding and no tenant metadata on unknown hosts (Constitution IX)
- [ ] T071 Implement guard composition in `apps/portal/src/lib/` and `apps/admin/src/lib/`:
  - `apps/portal/src/lib/tenant-context.ts`: `requireTenant()` → `resolveTenantFromHost()`.
  - `apps/portal/src/lib/guards.ts`: `requireStaff()`, `requirePermission(key, scope?)`, `requireManager()`. Each maps `AuthError` to a redirect to `/login` or a localized 403 page, and records a security event for forbidden attempts via `recordSecurityEvent('authz.denied')`.
  - `apps/admin/src/lib/platform-guards.ts`: `requirePlatformAdmin(capability)`.

  All modules are `server-only` (FR-025, FR-033)
- [ ] T072 [P] Write `tests/security/hosts-and-cookies.test.ts` (HTTP against running apps):
  - An unknown subdomain returns 404 with no tenant name in HTML.
  - A spoofed `X-Forwarded-Host` is ignored.
  - The admin app rejects tenant hosts and the portal rejects the admin host.
  - Auth cookies have no `Domain` attribute and carry `HttpOnly`/`SameSite=Lax`.
  - The `x-powered-by` header is absent.

  (FR-004, security-matrix test 10)

**Checkpoint**: `supabase db reset && supabase test db` passes. Unit tests pass. Both apps render localized neutral shells. GATE-AUTH proofs T018–T020 are recorded, or the dependent story tasks are paused.

---

## Phase 3: User Story 1 — Platform Super Admin onboards and controls an organization (Priority: P1) 🎯 MVP

**Goal**: A platform Super Admin signs in to the separate admin app and can:
- create tenants with an immutable subdomain and a first-manager invitation;
- edit the tenant name, then activate or suspend the tenant;
- appoint or revoke protected tenant-manager authority (last-manager invariant, all-session revocation on demotion);
- invite other platform admins under the 24h single-use rule.

Bootstrap and platform-admin removal stay operations-only.

**Independent Test**: Create tenants A and B with distinct subdomains and confirm both initial manager invitations arrive in the mail catcher. Then suspend A: fixture A sessions are denied by RLS/RPC while B is unaffected, and reactivation restores A. Verify:
- the manager grant/revoke rules, including the last-manager refusal and all-session revocation after demotion;
- the 24h platform-invite boundary;
- one-time bootstrap;
- that no UI/API route exists for platform-admin removal.

### Tests for User Story 1 (write first, must FAIL) ⚠️

- [ ] T073 [P] [US1] Write pgTAP `supabase/tests/010_tenant_lifecycle.test.sql`:
  - Only a platform admin with `tenants.manage` can call `platform_create_tenant`.
  - Missing name, invalid, reserved or duplicate subdomain return stable error codes.
  - The subdomain is immutable even via platform RPCs.
  - Suspension makes `request_context_ok()` false for tenant-A staff and blocks every tenant RPC; tenant B is unaffected.
  - Reactivation restores access under existing roles; a disabled individual stays disabled.
  - Tenant staff and anon cannot call platform RPCs.

  (FR-002–FR-007, SC-002)
- [ ] T074 [P] [US1] Write pgTAP `supabase/tests/011_manager_authority.test.sql`:
  - Grant and revoke require `tenants.managers.manage`.
  - Tenant managers and delegates cannot grant or revoke via any RPC or direct table write.
  - Revoking the last activated active manager is rejected; a pending manager invitation does not count.
  - Demotion keeps `enabled`, keeps non-manager `staff_roles`, removes manager-only capability, and revokes ALL that staff's registry sessions.
  - Grant and revoke events appear in both platform and tenant audit.

  (FR-008, FR-026, CL-023–CL-026, SC-005)
- [ ] T075 [P] [US1] Write `tests/security/manager-revocation-race.test.ts`:
  - Two parallel revocations of a tenant's two managers succeed at most once.
  - After demotion commits, a request racing on the pre-demotion session is denied.
  - The old refresh token cannot be refreshed.
  - The demoted user can sign in again and holds only non-manager grants.

  (CL-024, CL-026, FR-022)
- [ ] T076 [P] [US1] Write pgTAP `supabase/tests/012_platform_admin_invitations.test.sql`:
  - Only `platform_admins.invite` holders can invite.
  - Redemption works at `issued_at + 23:59:59` and fails at exactly `+24:00:00`, after redemption, and with a mismatched recipient email.
  - No `platform_admins` row exists before redemption.
  - Granted capabilities are ⊆ the inviter's.
  - No platform-admin removal function is executable by `authenticated`.

  (FR-001, CL-040–CL-042, SC-002)
- [ ] T077 [P] [US1] Write `tests/security/platform-bootstrap.test.ts`. `scripts/ops/bootstrap-platform-admin.ts` succeeds once without creating any invitation. A second run and 5 concurrent runs refuse and leave no orphan Auth users. No admin or portal HTTP route can create a platform admin (probe POSTs to every app route). Platform audit contains the bootstrap event with no secrets (CL-043, SC-002)
- [ ] T078 [P] [US1] Write Playwright `tests/e2e/us1-tenant-onboarding.spec.ts`:
  - Admin sign-in on the admin host.
  - Create tenants A and B; duplicate/invalid subdomain errors appear in AR and EN.
  - Initial manager emails are captured from the mail catcher.
  - Edit tenant A's name; the subdomain field is read-only.
  - Suspend and reactivate A with confirmation dialogs.
  - Grant a manager to existing staff; revoke a manager, which is refused for the last manager.
  - Invite a platform admin and accept it.

  (US1 scenarios 1–14)

### Implementation for User Story 1

- [ ] T079 [US1] Create migration `supabase/migrations/<ts>_platform_tenant_rpcs.sql`:
  - `public.platform_create_tenant(p_display_name text, p_subdomain text, p_state tenant_state, p_manager_email text, p_token_hash text) returns uuid`. It requires `private.is_platform_admin('tenants.manage')`, validates name and subdomain (stable codes `name_required|subdomain_invalid|subdomain_reserved|subdomain_taken`), inserts the tenant, issues the initial manager invitation via `private.issue_staff_invitation(..., p_grants_manager => true, ...)` in the same transaction (rolled back on `email_unavailable`), and writes `tenant.created` to both platform and tenant audit.
  - `public.platform_set_tenant_state(p_tenant_id, p_state)`: active/suspended only, audited.
  - `public.platform_update_tenant_name(p_tenant_id, p_display_name)`: audited `tenant_settings`, and never touches the subdomain.
  - `public.platform_list_tenants()` and `public.platform_get_tenant(p_tenant_id)`, which return only tenant metadata (no tenant-private data).

  (FR-002–FR-007, FR-029, FR-036)
- [ ] T080 [US1] Create migration `supabase/migrations/<ts>_platform_manager_rpcs.sql`, all requiring `is_platform_admin('tenants.managers.manage')` and taking `select … from tenants where id = p_tenant_id for update` to serialize manager changes per tenant:
  - `public.platform_grant_tenant_manager(p_tenant_id, p_staff_id)`: promotes existing activated enabled staff in that tenant.
  - `public.platform_invite_tenant_manager(p_tenant_id, p_email, p_token_hash)`: an invitation with `grants_manager => true`.
  - `public.platform_revoke_tenant_manager(p_tenant_id, p_staff_id)`. It rejects with `last_active_manager` when no other activated, enabled, unrevoked manager remains. Pending invitations do not count. The same check applies to suspended tenants, flagged for owner confirmation in T021. It sets `revoked_at`, keeps `staff_roles` and `enabled` unchanged, calls `private.revoke_sessions(<all sessions of that staff>, 'manager_demoted')`, and writes platform and tenant audit events.

  (FR-008, CL-023–CL-026)
- [ ] T081 [US1] Create migration `supabase/migrations/<ts>_platform_invitations.sql`:
  - `public.platform_invitations`: `id`, `recipient_email_normalized`, `capabilities text[]`, `invited_by uuid not null`, `token_hash unique`, `issued_at`, `expires_at` (always `issued_at + interval '24 hours'`), `consumed_at`.
  - `public.platform_invite_admin(p_email, p_capabilities, p_token_hash)`: requires `platform_admins.invite`; capabilities ⊆ the caller's.
  - `private.peek_platform_invitation(p_token_hash)`: service_role only; returns validity and the recipient email.
  - `private.redeem_platform_invitation(p_token_hash, p_auth_user_id)`: service_role only. It locks the row, requires `now() < expires_at` and `consumed_at is null`, requires the auth user's email to equal the recipient, inserts `platform_admins` and audits acceptance. Rejected attempts are audited without the token.

  (FR-001, CL-040, CL-042)
- [ ] T082 [US1] Create migration `supabase/migrations/<ts>_platform_ops_functions.sql`, with all functions service_role only and no `public` RPC:
  - `private.bootstrap_platform_admin(p_auth_user_id uuid, p_operator_ref text) returns boolean`. It locks `private.platform_bootstrap_state` and returns false if `bootstrapped_at` is set or any `platform_admins` row exists. Otherwise it inserts `platform_admins` with all capabilities and `created_via = 'bootstrap'`, sets `bootstrapped_at` and `operator_ref`, and writes platform audit. It creates no invitation, so no application screen takes part in bootstrap (CL-043).
  - `private.ops_revoke_platform_admin(p_auth_user_id, p_operator_ref, p_ticket_ref, p_emergency bool)`. It refuses to remove the last enabled admin holding `tenants.manage` unless `p_emergency`. It sets `enabled=false`, revokes all platform sessions via `private.revoke_sessions` and writes platform audit.

  (CL-041, CL-043)
- [ ] T083 [US1] Regenerate `packages/db/src/types.gen.ts` (`pnpm db:types`) after T079–T082
- [ ] T084 [US1] Implement admin sign-in in `apps/admin/src/app/login/` and `apps/admin/src/features/auth/`:
  - `apps/admin/src/app/login/page.tsx`: localized email + password form using `@workspace/ui`.
  - `apps/admin/src/features/auth/sign-in-action.ts`: `signInWithPassword` via the admin SSR client. It requires an enabled `platform_admins` row (otherwise it revokes the new session and returns a neutral error), calls `registerSession` with a platform owner, and records failures to platform audit.
  - `apps/admin/src/features/auth/sign-out-action.ts`: revokes the current registry session and calls `signOut({scope:'local'})`.

  (FR-001)
- [ ] T085 [US1] Implement the admin shell `apps/admin/src/app/(app)/layout.tsx`: `AppShell` with platform navigation (Tenants, Platform admins, Platform audit), filtered by capability, behind `requirePlatformAdmin()`. Admin wording and assets stay inside `apps/admin` and never in shared tenant-facing templates (Constitution IX)
- [ ] T086 [P] [US1] Implement the tenant directory `apps/admin/src/app/(app)/tenants/page.tsx`: name, subdomain, state, created date, using `platform_list_tenants`. It shows no tenant-private data (FR-029)
- [ ] T087 [US1] Implement tenant creation: `apps/admin/src/app/(app)/tenants/new/page.tsx` (fields: display name, subdomain, initial state, first manager email; client and server zod validation reusing `validateSubdomain`) and `apps/admin/src/features/tenants/create-tenant-action.ts`, which calls `issueInvitation` (T058) with `platform_create_tenant` and maps error codes to localized, non-sensitive messages (US1 scenarios 1–2)
- [ ] T088 [US1] Implement tenant details `apps/admin/src/app/(app)/tenants/[tenantId]/page.tsx`:
  - Name edit, with the subdomain displayed read-only.
  - State switch behind a confirmation `AlertDialog`.
  - A managers section: active managers and pending manager invitations.

  Server actions go in `apps/admin/src/features/tenants/update-tenant-actions.ts` (`platform_update_tenant_name`, `platform_set_tenant_state`) (US1 scenarios 3–6)
- [ ] T089 [US1] Implement manager controls. `apps/admin/src/features/managers/actions.ts` provides `promoteManager`, `inviteManager` and `revokeManager`, mapping `last_active_manager` to a localized message. Add matching UI in `apps/admin/src/app/(app)/tenants/[tenantId]/managers-panel.tsx`; promotion picks an existing activated staff member by username/email within that tenant only (US1 scenarios 7–11)
- [ ] T090 [US1] Implement platform-admin invitation: `apps/admin/src/app/(app)/admins/invite/page.tsx` and `apps/admin/src/features/platform-admins/invite-action.ts` (capability checkboxes limited to the actor's own capabilities, 24h link to `https://<ADMIN_HOST>/admins/accept?token=…`). Do NOT add any list action that removes, demotes or disables an admin (CL-040, CL-041)
- [ ] T091 [US1] Implement platform-admin acceptance: `apps/admin/src/app/admins/accept/page.tsx` (public) and `apps/admin/src/features/platform-admins/accept-action.ts`:
  1. `peek_platform_invitation`; an invalid or expired token shows a neutral message and no form.
  2. The recipient sets a password.
  3. `auth.admin.createUser({email, password, email_confirm:true})`.
  4. `redeem_platform_invitation`; on failure, delete the created Auth user (compensation per R-01).
  5. Sign in and call `registerSession`.

  Reject recipients whose email belongs to tenant staff ⛔ GATE-COLLIDE (CL-042)
- [ ] T092 [P] [US1] Implement `scripts/ops/bootstrap-platform-admin.ts` (run only with `OPS_CONFIRM=yes`, `OPERATOR_REF`, the target email and a service-role key from the secret manager; never from app code):
  1. Refuse early if bootstrap already happened.
  2. The target administrator types their password at a hidden TTY prompt (no echo; never passed via argv or env, never logged or stored by the script) and it is checked against the password policy.
  3. `auth.admin.createUser({email, password, email_confirm:true})`. The operator has verified the target's identity and mailbox out of band.
  4. `private.bootstrap_platform_admin`. If it returns false (lost race or already bootstrapped), delete the created Auth user.

  The first admin then signs in through the normal admin login (T084); no invitation link or setup screen is used. Document it in `docs/operations/bootstrap-platform-admin.md`: who may run it, verification of the target identity, credential handling, and evidence to record (CL-043)
- [ ] T093 [P] [US1] Implement `scripts/ops/revoke-platform-admin.ts` (`OPS_CONFIRM`, `OPERATOR_REF`, `TICKET_REF`; calls `private.ops_revoke_platform_admin`). Document it in `docs/operations/revoke-platform-admin.md`: the authorization chain, identity verification, emergency path, and evidence (CL-041)
- [ ] T094 [P] [US1] Write `docs/operations/tenant-provisioning.md`: wildcard DNS/TLS covers new subdomains, subdomain naming rules, immutability, suspension/reactivation effects, and the rule that no tenant deletion exists (FR-003–FR-007)
- [ ] T095 [US1] Run `supabase test db` (`supabase/tests/010_*.test.sql`–`012_*.test.sql`), `pnpm vitest tests/security/manager-revocation-race.test.ts tests/security/platform-bootstrap.test.ts` and `pnpm e2e tests/e2e/us1-tenant-onboarding.spec.ts` until T073–T078 pass. Fix the implementation, never the assertions, unless a spec-traceable error is found in a test

**Checkpoint**: The US1 independent test passes. The admin app can onboard and control tenants without any portal staff features.

---

## Phase 4: User Story 2 — Invited employee activates an independent tenant account and signs in (Priority: P1)

**Goal**: Delivers:
- tenant staff invitations (7-day, single-use, resend cooldown/cap, no cancellation, globally unique email);
- activation with a self-chosen username and password;
- username-or-email sign-in bound to the host tenant, with non-enumerating failures;
- username change without step-up, and an immutable email;
- self-service and manager-assisted password recovery (60-min, newest-only, 300s cooldown, 5/24h);
- lost-mailbox re-onboarding.

**Independent Test**: Invite separate staff in tenants A and B with different emails, activate them via mail-catcher links, and sign in with username (any case) and with email. Tenant-B invitation or activation of A's email is denied without disclosure, including concurrent and disabled-account cases. Test username change, recovery and manager-assisted reset at every boundary.

⛔ GATE-AUTH (T018–T020) must be closed before this story is accepted as secure.

### Tests for User Story 2 (write first, must FAIL) ⚠️

- [ ] T096 [P] [US2] Write unit tests `packages/auth/src/username.test.ts` for the shared validator: the same cases as T039, plus localized error-key mapping (FR-010, CL-007–CL-010)
- [ ] T097 [P] [US2] Write pgTAP `supabase/tests/020_staff_invitations.test.sql`:
  - **Authorization**: `invite_staff` requires `staff.invite` or manager authority, and roles must be active, same-tenant and within the grant ceiling; a manager-authority invite from tenant actors is impossible.
  - **Expiry**: redemption works at `+167:59:59` and fails at exactly `+168:00:00`; links are single-use.
  - **Resend authorization**: manager or permitted platform admin only.
  - **Cooldown**: resend at 899s is denied and leaves the link, expiry and cooldown unchanged; resend at 900s supersedes all earlier links with a fresh 168h link.
  - **Cap**: the 6th successful resend within a rolling 24h is denied with no side effect; initial issuance is not counted; when the oldest resend leaves the window, a resend is allowed again.
  - **No cancellation**: no cancel function exists and direct UPDATEs are denied.

  (FR-009, CL-003, CL-004, CL-020–CL-022, SC-003)
- [ ] T098 [P] [US2] Write pgTAP `supabase/tests/021_username_and_email.test.sql`:
  - `change_my_username` requires a live session and changes only the caller's row.
  - Case-insensitive tenant uniqueness applies; the same name in another tenant is allowed.
  - The change is audited, with no password parameter.
  - No RPC changes an email.
  - The `auth.users` email trigger blocks email change for linked staff.

  (FR-010, FR-011, CL-011, CL-012)
- [ ] T099 [P] [US2] Write pgTAP `supabase/tests/022_recovery.test.sql`:
  - **Expiry**: redeem at `+59:59` OK; at `+60:00` rejected; single-use.
  - **Newest-only**: a newer issuance supersedes older links across self-service and manager origins.
  - **Cooldown**: 299s is denied without invalidating the current link; 300s is allowed.
  - **Daily cap**: the 6th issuance in a rolling 24h is denied, uncounted and without side effects.
  - **Isolation**: different accounts have independent counters.
  - **Manager-assisted reset**: requires manager authority, same tenant, an enabled target, not self, and a fresh own-password confirmation record.
  - **Completion**: revokes ALL sessions of the target.

  (FR-015, FR-021, CL-015–CL-019, SC-004)
- [ ] T100 [P] [US2] Write `tests/security/invitation-races.test.ts`:
  - Concurrent resends never exceed the cooldown or cap.
  - Concurrent redemption of one link creates exactly one `tenant_staff`.
  - The old link fails after a reissue, even when it races.
  - Concurrent activations choosing `Ahmed`/`ahmed` in one tenant succeed once.
  - Two tenants inviting the same email simultaneously yield one invitation.

  (SC-003, edge cases)
- [ ] T101 [P] [US2] Write `tests/security/recovery-races.test.ts`. Parallel issuance inside the cooldown issues exactly one link. Redemption racing a reissue never lets the older link succeed. Parallel requests cannot exceed 5/24h (CL-017–CL-019)
- [ ] T102 [P] [US2] Write `tests/security/login-enumeration.test.ts`. Sign-in failures for an unknown username, a wrong password, a disabled account, a tenant-B email on the tenant-A host, and a suspended tenant return an identical status, body and error code, with response-time medians within the tolerance recorded by T020 in research.md R-02. After the approved number of failures, further sign-in attempts for that identifier or client IP are throttled with the same generic response, while other identifiers and tenants are unaffected. Public recovery always returns the same neutral response, including when throttled (FR-014, US2 scenario 6)
- [ ] T103 [P] [US2] Write Playwright `tests/e2e/us2-invite-activate-login.spec.ts`:
  - A manager invites in tenants A and B.
  - The invitee opens the link, sees localized username rules, gets inline errors for invalid names, and activates.
  - Sign in with `Ahmed`, `AHMED` and the email.
  - Sign-in with A's email at host B fails generically.
  - Change the username and sign in with the new one; the old one fails.
  - Self-service recovery; manager-assisted reset with own-password entry; an expired-link message.

  (US2 scenarios 1–28)
- [ ] T104 [P] [US2] Write `tests/security/lost-mailbox-reonboarding.test.ts`:
  - Disabling the old account denies its sessions.
  - Inviting a new email creates a new `tenant_staff.id` with no roles preselected or copied.
  - The old row, email and audit authorship are unchanged.
  - Re-inviting the old (disabled) email is denied.

  (CL-013, CL-014, US2 scenarios 20–22)

### Implementation for User Story 2

- [ ] T105 [P] [US2] Implement `packages/auth/src/username.ts`: `validateUsername(value)` returning `{ok:true}` or `{ok:false, code:'length'|'charset'|'placement'}` with logic equivalent to `^[A-Za-z]+(?:[._][A-Za-z]+)*$` and 3–30 chars. Add the AR/EN messages to `packages/i18n/src/dictionaries/{ar,en}.ts` under `username.*` (FR-010)
- [ ] T106 [US2] Create migration `supabase/migrations/<ts>_staff_invitation_rpcs.sql`:
  - `public.invite_staff(p_email, p_role_ids uuid[], p_token_hash)`: tenant actor; requires `request_context_ok()` and (`has_permission('staff.invite')` or `is_active_tenant_manager()`); takes `private.rbac_lock` and requires every role to pass `private.actor_can_grant_role(role_id)` (T034); never `grants_manager`. Audited as `invitations` / `staff.invited`.
  - `public.platform_invite_staff(p_tenant_id, p_email, p_role_ids, p_token_hash)`: requires `is_platform_admin('tenants.staff.manage')`.
  - `public.resend_staff_invitation(p_invitation_id, p_token_hash)` (manager-only) and `public.platform_resend_staff_invitation(...)`. Both lock the invitation `for update`, require `state = 'pending'`, require `now() - max(issued_at) >= interval '900 seconds'`, require fewer than 5 `kind = 'resend'` links within the last 24h, supersede all links, insert a fresh 168h link, and re-claim the email reservation (`email_unavailable` if another tenant claimed it after expiry). Each is audited.
  - `public.list_pending_invitations()`: tenant-scoped; returns email, roles, latest issued/expiry and resend availability, never token hashes.

  (FR-008, FR-009, CL-004, CL-021, CL-022)
- [ ] T107 [US2] Create migration `supabase/migrations/<ts>_invitation_redemption.sql`, both functions service_role only:
  - `private.peek_staff_invitation(p_token_hash)` returns `tenant_id`, recipient email and validity.
  - `private.redeem_staff_invitation(p_token_hash, p_auth_user_id, p_username)`:
    1. Locks the link and invitation and requires the tenant `active`, `now() < expires_at`, not consumed and not superseded.
    2. Validates the username and its case-insensitive uniqueness.
    3. Inserts `tenant_staff` (email from the invitation).
    4. Inserts `staff_roles` for invitation roles that are still active, recording skipped archived roles in audit metadata.
    5. Inserts a manager grant if `grants_manager` is set.
    6. Marks the link consumed and the invitation redeemed, and deletes the reservation (the `tenant_staff` uniqueness now holds the email).
    7. Audits the redemption.

  (FR-009, CL-003)
- [ ] T108 [US2] Implement invitation acceptance: `apps/portal/src/app/(public)/invite/accept/page.tsx` and `apps/portal/src/features/invitations/accept-action.ts`:
  1. Require `peek` tenant = host tenant; otherwise show a neutral invalid/expired message.
  2. Show the recipient email read-only.
  3. Validate username and password.
  4. `auth.admin.createUser({email, password, email_confirm:true})`.
  5. `redeem_staff_invitation`; on failure, delete the Auth user and show a mapped error (e.g., `username_taken`).
  6. Sign in and call `registerSession`.

  No public registration route exists (FR-009, FR-016, US2 scenarios 1–3, 11)
- [ ] T109 [P] [US2] Implement `scripts/ops/reconcile-auth-users.ts` plus the scheduled CI/cron documentation in `docs/operations/reconciliation.md`. List Auth users older than 1h that have no `tenant_staff` or `platform_admins` row, report them, and delete them only with `--apply`. Never grant access to incomplete accounts (R-01)
- [ ] T110 [US2] Implement staff invitation UI: `apps/portal/src/app/(app)/settings/staff/invite/page.tsx` (email plus a role multi-select listing only active roles the actor may grant, from `my_effective_permissions`/ceiling) and `apps/portal/src/features/staff/invite-action.ts` (`issueInvitation` with `invite_staff`). `email_unavailable` maps to a neutral message that discloses no tenant (US2 scenarios 1, 5, 8)
- [ ] T111 [US2] Implement pending invitations: `apps/portal/src/app/(app)/settings/staff/invitations/page.tsx` (list plus a Resend button for managers that is disabled until cooldown and cap allow, showing the next allowed time; there is NO cancel control) and `apps/portal/src/features/invitations/resend-action.ts` (FR-009, CL-020–CL-022)
- [ ] T112 [US2] Create migration `supabase/migrations/<ts>_login_resolution.sql` with `private.resolve_login_email(p_tenant_id uuid, p_identifier text) returns text`, service_role only. An identifier containing `@` matches `email_normalized` in that tenant; otherwise it matches `lower(p_identifier)` against `username_normalized`. It returns the email only for an enabled staff member of an active tenant, else `null`. The same migration adds:
  - `private.auth_attempts` (`tenant_id`, `kind text check in ('sign_in','recovery')`, `identifier_hmac`, `client_ip_hmac`, `attempted_at`, `succeeded`), with no raw identifiers or IPs, plus an hourly `pg_cron` job that deletes rows older than 24 hours.
  - `private.auth_abuse_limits`, seeded from `docs/decisions/auth-abuse-controls.md` ⛔ GATE-ABUSE.
  - `private.check_and_record_auth_attempt(p_tenant_id, p_kind, p_identifier_hmac, p_client_ip_hmac) returns boolean` (service_role only), which records the attempt and returns false when any limit is exceeded.

  (FR-012, FR-014, edge case "credential stuffing/abuse")
- [ ] T113 [US2] Implement sign-in: `apps/portal/src/app/(public)/login/page.tsx` (tenant identity header, username-or-email plus password, localized) and `apps/portal/src/features/auth/sign-in-action.ts`:
  1. Resolve the tenant from the host.
  2. Call `check_and_record_auth_attempt('sign_in', …)` with HMAC-SHA256 (`AUTH_THROTTLE_HMAC_KEY`) of the normalized identifier and of the client IP from `packages/auth/src/server/client-ip.ts`, which trusts `x-forwarded-for` only when `TRUSTED_PROXY_HOPS > 0`. When throttled, return the same generic failure as every other failure. Supabase Auth rate limits stay as a second layer.
  3. `resolve_login_email`. When it returns null, still call `signInWithPassword` with a fixed non-existent placeholder address to equalize timing.
  4. On success, re-check `staff.tenant_id === host tenant`; otherwise sign out and fail generically.
  5. `registerSession`.
  6. On failure, write `recordSecurityEvent('auth.sign_in_failed')` with a hashed identifier.

  Rely on Supabase Auth rate limits configured in `supabase/config.toml` `[auth.rate_limit]`; IP/global limits remain pending G-02 (FR-012, FR-014, US2 scenarios 4–6)
- [ ] T114 [P] [US2] Implement sign-out in `apps/portal/src/features/auth/sign-out-action.ts`: revoke the current registry session (`sign_out`) and call `signOut({scope:'local'})`
- [ ] T115 [US2] Create migration `supabase/migrations/<ts>_username_change.sql`. `public.change_my_username(p_username text)` requires `request_context_ok()`, updates only `private.current_staff()`, validates format, maps unique violations to `username_taken`, and audits `staff.username_changed` with old and new values. It takes no password parameter (FR-011, CL-011)
- [ ] T116 [US2] Implement the account page `apps/portal/src/app/(app)/account/page.tsx`: username change form with no password field, email shown read-only via `LtrText` with an "email cannot be changed" note. Add `apps/portal/src/features/account/change-username-action.ts` (US2 scenarios 9–10, 14–19)
- [ ] T117 [US2] Create migration `supabase/migrations/<ts>_auth_email_immutability.sql`: a `BEFORE UPDATE OF email, email_change ON auth.users` trigger that raises when the user is linked to `tenant_staff`, using the method proven in T020 ⛔ GATE-AUTH (CL-012, edge case "lower-level Auth update")
- [ ] T118 [US2] Create migration `supabase/migrations/<ts>_recovery.sql`:
  - `public.recovery_requests`: `id`, `tenant_id`, `staff_id`, `origin text check in ('self_service','manager_assisted','platform_assisted')`, `requested_by_staff_id null`, `requested_by_platform_admin_id null`, `token_hash unique`, `issued_at`, `expires_at` (always `issued_at + interval '60 minutes'`), `used_at`, `superseded_at`, `failed_at`, with a composite FK.
  - `public.password_confirmations`: `actor_auth_user_id`, `confirmed_at`, `expires_at` (+120s), `consumed_at`; written by the service role only.
  - `private.issue_recovery(p_staff_id, p_origin, p_actor_staff_id, p_actor_platform_admin_id, p_token_hash) returns boolean`. It locks the `tenant_staff` row `for update`, requires 300s since the last issuance and fewer than 5 issuances in 24h, supersedes earlier links, inserts the new link and audits. A denial returns false with no side effects.
  - `private.begin_recovery_redemption(p_token_hash)`: locks the row, validates it, sets `used_at` and returns `auth_user_id`.
  - `private.complete_recovery_redemption(p_request_id)`: revokes ALL sessions (`recovery` or `admin_reset`) and audits.
  - `public.request_manager_assisted_reset(p_target_staff_id, p_token_hash)`. It requires `is_active_tenant_manager()`, the same tenant, an enabled target, a target that is not self, and an unconsumed `password_confirmations` row for the actor within 120s (consumed atomically), then calls `issue_recovery`.

  (FR-015, FR-021, CL-015–CL-019)
- [ ] T119 [US2] Implement self-service recovery in `apps/portal/src/app/(public)/recover/` and `apps/portal/src/features/recovery/`:
  - `apps/portal/src/app/(public)/recover/page.tsx` and `apps/portal/src/features/recovery/request-action.ts`: `check_and_record_auth_attempt('recovery', …)` first (throttled requests get the same neutral response), identifier resolved via `resolve_login_email` within the host tenant, `issue_recovery('self_service')`, email sent only if issued, and an always-identical neutral response.
  - `apps/portal/src/app/(public)/recover/complete/page.tsx` and `apps/portal/src/features/recovery/complete-action.ts`: `begin_recovery_redemption`, then `auth.admin.updateUserById(password)`, then `complete_recovery_redemption`. On password-update failure, mark `failed_at` and show a neutral retry message.

  (FR-015, US2 scenarios 7, 25–28)
- [ ] T120 [US2] Implement manager-assisted reset: a dialog in `apps/portal/src/app/(app)/settings/staff/[staffId]/reset-password-dialog.tsx` asks for the MANAGER's own current password only. `apps/portal/src/features/staff/manager-reset-action.ts` then:
  1. Verifies the password with a throwaway non-persisting Supabase client and immediately revokes the resulting provider session (method from T020).
  2. Inserts `password_confirmations` via the service role.
  3. Calls `request_manager_assisted_reset` with the manager's JWT.
  4. Emails the link to the employee only.

  The manager never sees the employee's password (CL-015, US2 scenarios 23–24)
- [ ] T121 [P] [US2] Implement platform-assisted reset, mirroring CL-015 controls (own-password confirmation of the platform admin; `tenants.staff.manage`). Add `public.platform_request_staff_reset(...)` in `supabase/migrations/<ts>_platform_staff_reset.sql`, plus an action in `apps/admin/src/features/tenants/staff-reset-action.ts` ⛔ GATE-RBAC (confirm the platform variant) (Constitution III, FR-015)
- [ ] T122 [US2] Add AR/EN strings for invitation, sign-in, recovery, username and the related errors to `packages/i18n/src/dictionaries/{ar,en}.ts`, with neutral wording and no provider names (FR-038, Constitution X)
- [ ] T123 [US2] Run `supabase test db` (`supabase/tests/020_*`–`022_*`), the `tests/security/` suites from T100–T102 and T104, `packages/auth/src/username.test.ts` and `tests/e2e/us2-invite-activate-login.spec.ts` until T096–T104 pass

**Checkpoint**: Staff in two tenants can be invited, activate, sign in, change usernames and recover access with every boundary enforced.

---

## Phase 5: User Story 3 — Staff use long-lived, controllable sessions on multiple devices (Priority: P1)

**Goal**: Delivers:
- a rolling 30-day inactivity window renewed only by user-initiated, server-authorized requests;
- an Active Sessions list with no IP or location;
- confirmation-only individual and bulk "other session" revocation;
- password change that revokes other sessions;
- immediate denial after recovery, reset, disablement or suspension.

**Independent Test**: Open sessions in two browser contexts, perform meaningful activity, and confirm background refresh does not renew. Revoke one session, then all others. Change the password, recover it, disable the account and suspend the tenant, asserting the expected authorization in every case.

⛔ GATE-AUTH (T018) must be closed before acceptance.

### Tests for User Story 3 (write first, must FAIL) ⚠️

- [ ] T124 [P] [US3] Write pgTAP `supabase/tests/030_sessions.test.sql`:
  - `list_my_sessions` returns only the caller's own tenant sessions, with columns limited to id, device_type, browser, created_at, verified_activity_at and is_current; no token or IP fields exist.
  - `revoke_my_session` refuses the current session, other accounts' sessions and stale or already-revoked ids, with a neutral not-found.
  - `revoke_my_other_sessions` keeps the current session only.
  - `touch_session_activity` does nothing for a dead or unauthorized session.

  (FR-020, CL-037–CL-039)
- [ ] T125 [P] [US3] Write `tests/security/session-revocation.test.ts` (two sign-ins = two devices):
  - Revoking the other session denies its access token on the next RPC/RLS read and makes its refresh fail, while the current session still works.
  - Revoke-all-others races 10 concurrent refreshes from the other sessions and none survive.
  - Password change revokes the others and the current session is revalidated.
  - Recovery and admin reset revoke all sessions.
  - Disabling the account and suspending the tenant deny the next request from every session.
  - Revoke requests targeting another tenant's or account's session are denied.

  (FR-020–FR-022, SC-004)
- [ ] T126 [P] [US3] Write `tests/security/session-activity.test.ts`:
  - `refreshSession()`, prefetch requests (`Next-Router-Prefetch: 1` / `Purpose: prefetch`), passive polling routes and denied requests do NOT change `verified_activity_at`.
  - A protected page navigation, a data read and a save do change it.
  - A session with `verified_activity_at = now() - 30 days` is denied and redirected to login; at 29d23h it is allowed.

  (FR-018, CL-036)
- [ ] T127 [P] [US3] Write Playwright `tests/e2e/us3-sessions.spec.ts`:
  - Two contexts.
  - The sessions page shows device/browser (or the "Unknown" fallback), sign-in time, last activity and a Current badge; the DOM has no IP/location text and no geolocation permission is requested.
  - Cancel in the individual-revoke dialog changes nothing; confirm revokes and the other context is sent to login on its next navigation.
  - Logout All Other Sessions works the same way.
  - Reusing `storageState` in a new context ("browser restart") stays signed in.

  (US3 scenarios 1–6, CL-037–CL-039)

### Implementation for User Story 3

- [ ] T128 [US3] Create migration `supabase/migrations/<ts>_session_rpcs.sql`:
  - `public.list_my_sessions()`.
  - `public.revoke_my_session(p_session_id uuid)`: owner check via `auth.uid()` plus the tenant; never the current `session_id`; calls `private.revoke_sessions(..., 'user')`; audited as `sessions` / `session.revoked` without token values.
  - `public.revoke_my_other_sessions()`: `'user_all_others'`, audited.
  - `public.touch_session_activity()`: sets `verified_activity_at = now()` only when `request_context_ok()` holds, at most once per 60s per session.

  (FR-018, FR-020, CL-036–CL-039)
- [ ] T129 [US3] Implement `packages/auth/src/server/activity.ts`. `recordMeaningfulActivity(ctx, request)` calls `touch_session_activity` only for user-initiated requests. It skips prefetch headers, RSC background revalidation, HEAD/OPTIONS and route handlers flagged `passive`, and never runs from middleware (CL-036)
- [ ] T130 [US3] Integrate activity into the guards in `apps/portal/src/lib/guards.ts`. Call `recordMeaningfulActivity` only after successful authorization in protected page renders and server actions. Map `session_expired` to a redirect to `/login?reason=expired` with a neutral localized notice (FR-018)
- [ ] T131 [US3] Implement the Active Sessions page `apps/portal/src/app/(app)/account/sessions/page.tsx`: a table using `@workspace/ui`, the "Unknown device/browser" fallback, a Current badge, per-row Logout for other sessions, and a Logout All Other Sessions button. Both use `AlertDialog` confirmations with the CL-038/CL-039 wording and no password field. Add `apps/portal/src/features/account/sessions-actions.ts`, which double-submits idempotently (FR-020)
- [ ] T132 [US3] Implement password change: `apps/portal/src/app/(app)/account/password/page.tsx` and `apps/portal/src/features/account/change-password-action.ts`:
  1. Verify the current password with a throwaway client and revoke that provider session.
  2. `supabase.auth.updateUser({password})`.
  3. `revoke_my_other_sessions` with reason `password_change`.
  4. Refresh the current session to revalidate it; if revalidation fails, revoke the current session too and require sign-in.
  5. Audit the change.

  (FR-021, US3 scenario 4)
- [ ] T133 [P] [US3] Add AR/EN strings for sessions, password change and session-expired messages to `packages/i18n/src/dictionaries/{ar,en}.ts`
- [ ] T134 [US3] Run `supabase/tests/030_sessions.test.sql`, `tests/security/session-revocation.test.ts`, `tests/security/session-activity.test.ts` and `tests/e2e/us3-sessions.spec.ts` until T124–T127 pass

**Checkpoint**: Session semantics are proven end to end, including races. US1 suspension and US2 recovery revocation now also hold at the UI level.

---

## Phase 6: User Story 4 — Tenant managers administer staff and constrained roles (Priority: P1)

**Goal**: Delivers:
- tenant-local custom roles with explicit grants (All/Own/Assigned scope) and multi-role union;
- delegated role administration bounded by the grant ceiling;
- bans on self-role-edit (CL-027) and self-membership change (CL-044);
- archive-only retirement with a zero-assignment check, restore authority and name-collision rules;
- staff disable/enable within the tenant.

Protected manager authority stays platform-only.

**Independent Test**: Create two custom roles and assign both to one staff member, then verify the union. Attempt self-elevation, granting above authority, editing a role you hold, changing your own memberships, archiving an assigned role, restoring without authority or into a name collision, and cross-tenant operations. All must be denied, audited and free of side effects.

⛔ GATE-RBAC (T021) must be approved before production grants are final.

### Tests for User Story 4 (write first, must FAIL) ⚠️

- [ ] T135 [P] [US4] Write pgTAP `supabase/tests/040_roles.test.sql`:
  - **Ceiling**: create and update succeed only within the ceiling; a manager-only or non-grantable key is rejected.
  - **Self-edit**: an actor assigned to role R cannot change R's name, description, grants or scopes, even when reducing them (CL-027).
  - **Archive**: an assigned role (including one held only by disabled staff) is denied with no assignment removed; a zero-assignment role archives; archived roles disappear from active lists and cannot be assigned (CL-028, CL-029).
  - **Restore**: a delegate without `roles.restore` is denied; a delegate with `roles.restore` but lacking a contained grant is denied; a manager within the ceiling succeeds; no memberships return (CL-030).
  - **Names**: an archived name is reusable by a new role; restoring into an active-name conflict fails with `role_name_conflict` and no partial change; after an authorized rename it succeeds (CL-031).
  - **Tenancy**: cross-tenant role ids are rejected.

  (FR-023, FR-026)
- [ ] T136 [P] [US4] Write pgTAP `supabase/tests/041_staff_admin.test.sql`:
  - `set_staff_roles` with target = actor is denied for add, remove, swap and bulk, and writes a security event (CL-044).
  - Another authorized actor can add or remove within the ceiling.
  - Disable and enable affect only the same tenant; disabling self is denied; disabling the last active manager of an active tenant is denied.
  - Disable revokes all sessions.
  - No RPC edits email.
  - Multi-role union holds: `has_permission` is true for keys from either role, and an `own` grant does not imply `all` (FR-024).

  (FR-008, FR-022, FR-023)
- [ ] T137 [P] [US4] Write pgTAP `supabase/tests/042_record_scope.test.sql`. Inside the test transaction, create a temporary fixture table (`tenant_id`, `owner_staff_id`, `assignee_staff_ids uuid[]`); no business schema is added. Prove that `private.has_permission_for_record(key, tenant_id, owner_staff_id, assignee_ids)` respects tenant isolation and the All/Own/Assigned scopes for two tenants (FR-028, US4 scenario 6)
- [ ] T138 [P] [US4] Write `tests/security/role-races.test.ts`:
  - Archive racing a concurrent assignment never leaves an archived role with assignments.
  - A role edit racing the editor's own concurrent assignment to that role is denied at commit.
  - Restore racing the creation of a same-name role leaves exactly one active role.
  - Concurrent disables of the last two managers leave ≥1 active manager.

  (CL-027, CL-028, CL-031, FR-008)
- [ ] T139 [P] [US4] Write `tests/security/privilege-escalation.test.ts`:
  - A delegate grants a key or scope above their ceiling → denied, with a `authz.privilege_escalation_denied` security event.
  - Direct PostgREST INSERT/UPDATE/DELETE on `roles`, `permission_grants`, `staff_roles`, `tenant_manager_grants` and `tenant_staff` with a staff JWT → denied by RLS.
  - A tenant JWT calling platform RPCs → denied.
  - Granting `platform_admins.invite` or manager authority via any tenant path → impossible.

  (FR-026, SC-005, security-matrix tests 4–5)
- [ ] T140 [P] [US4] Write Playwright `tests/e2e/us4-staff-roles.spec.ts`:
  - The manager creates two roles and assigns both to staff X; X's navigation shows the union.
  - Self-assignment controls are absent on one's own staff page, and the server action is denied if forged.
  - The edit form is read-only for a role you hold.
  - Archiving an in-use role shows a localized error.
  - A restore name conflict shows a validation message.
  - Disable/enable with confirmation.

  (US4 scenarios 1–6, 4a–4g)

### Implementation for User Story 4

- [ ] T141 [US4] Create migration `supabase/migrations/<ts>_rbac_rpcs.sql`:
  - Uses `private.rbac_lock`, `private.actor_can_grant` and `private.actor_can_grant_role` from Foundational (T034); do not redefine them.
  - `public.create_role(p_name, p_description, p_grants jsonb)`: requires `roles.create` or manager, plus the ceiling.
  - `public.update_role(p_role_id, p_name, p_description, p_grants jsonb)`: requires `roles.update` or manager. After `rbac_lock`, it denies when the actor is assigned to the role (CL-027) and writes a security event on that denial. It applies the ceiling to both added and removed grants and allows renaming archived roles.
  - `public.archive_role(p_role_id)`: requires `roles.archive` or manager. After `rbac_lock`, it requires zero `staff_roles` rows, including disabled staff (CL-028, CL-029).
  - `public.restore_role(p_role_id)`: requires a manager or `roles.restore`, plus `actor_can_grant_role`. It fails with `role_name_conflict` if the active name is taken, and restores no memberships (CL-030, CL-031).
  - Every outcome, including denials, is audited under the `roles` category.
- [ ] T142 [US4] Create migration `supabase/migrations/<ts>_staff_admin_rpcs.sql`:
  - `public.set_staff_roles(p_staff_id, p_add uuid[], p_remove uuid[])`. It requires `staff.roles.assign` or manager authority. After `rbac_lock`, it denies when `p_staff_id = current_staff().id` and writes a security event (CL-044). The target must be in the same tenant; added roles must be active; every added and removed role must pass `actor_can_grant_role`. Each change is audited.
  - `public.disable_staff(p_staff_id)`: requires `staff.disable` or manager; not self; refuses the last active manager of an active tenant (locks the tenant row); sets `enabled=false`; calls `revoke_sessions('disabled')`; audited.
  - `public.enable_staff(p_staff_id)`: requires `staff.enable` or manager; audited.
  - `public.list_staff()`: `staff.view`; returns id, username, email, enabled, activated_at, roles and is_manager.
  - `public.get_staff(p_staff_id)`.

  No other editable staff attributes are defined by the spec; do not add any (FR-008, FR-022, FR-023)
- [ ] T143 [US4] Create migration `supabase/migrations/<ts>_record_scope_helper.sql` with `private.has_permission_for_record(p_key text, p_tenant_id uuid, p_owner_staff_id uuid, p_assignee_ids uuid[]) returns boolean`. It returns true when the actor is in the same tenant and holds `p_key` with scope `all`, `own` with `owner = actor`, or `assigned` with the actor in the assignees. It is for future modules; there are no business tables (FR-028)
- [ ] T144 [P] [US4] Implement `packages/authorization/src/scope.ts` (`scopeAllows`, mirroring the SQL helper) with `packages/authorization/src/scope.test.ts`
- [ ] T145 [US4] Regenerate `packages/db/src/types.gen.ts` after T141–T143
- [ ] T146 [US4] Implement the staff directory `apps/portal/src/app/(app)/settings/staff/page.tsx` (`list_staff`, link to pending invitations from T111, manager badge read-only) and staff details `apps/portal/src/app/(app)/settings/staff/[staffId]/page.tsx`:
  - The role assignment editor, with only grantable active roles; hidden for one's own record and still denied server-side.
  - Disable/enable via `AlertDialog`.
  - The reset-password entry point from T120.
  - No email edit and no manager grant controls.

  Add `apps/portal/src/features/staff/actions.ts` (`setStaffRoles`, `disableStaff`, `enableStaff`) (FR-008, CL-044)
- [ ] T147 [US4] Implement roles UI in `apps/portal/src/app/(app)/settings/roles/` and `apps/portal/src/features/roles/actions.ts`:
  - `apps/portal/src/app/(app)/settings/roles/page.tsx`: Active and Archived tabs.
  - `apps/portal/src/app/(app)/settings/roles/new/page.tsx`.
  - `apps/portal/src/app/(app)/settings/roles/[roleId]/page.tsx`: a permission picker limited to grantable catalog keys within the ceiling, a scope selector (All/Own/Assigned) where the catalog supports it, and an audit-category selector for `audit_logs.view`. The form is read-only with an explanation when the actor holds the role. Archive and Restore buttons show error mapping for `role_assigned`, `role_name_conflict` and `forbidden`.

  Add `apps/portal/src/features/roles/actions.ts` (FR-023, FR-026, FR-027)
- [ ] T148 [P] [US4] Add AR/EN strings for staff, roles, permissions (per catalog key), scopes and errors to `packages/i18n/src/dictionaries/{ar,en}.ts`
- [ ] T149 [US4] Run `supabase/tests/040_roles.test.sql`–`042_record_scope.test.sql`, `tests/security/role-races.test.ts`, `tests/security/privilege-escalation.test.ts` and `tests/e2e/us4-staff-roles.spec.ts` until T135–T140 pass

**Checkpoint**: The RBAC foundation is centrally enforced in the database and server, and is ready for future business modules.

---

## Phase 7: User Story 5 — Staff work inside an accessible, white-label bilingual shell (Priority: P1)

**Goal**: Delivers:
- the tenant name and optional logo with a neutral fallback, editable by the manager only (plus platform intervention);
- one fixed palette;
- Arabic RTL by default with full English LTR;
- Dark/Light/System preference persisted per user;
- permission-aware primary navigation with an optional secondary sidebar;
- WCAG 2.2 AA;
- no provider branding anywhere tenant-facing.

**Independent Test**: Use two tenants with different names and logos (and one with no logo). Exercise login and the shell in AR/RTL and EN/LTR, Dark/Light/System, keyboard-only, and with permissions that hide navigation. Confirm that only the manager can change branding.

⛔ GATE-BRAND (T022) must be approved for final palette and logo constraints.

### Tests for User Story 5 (write first, must FAIL) ⚠️

- [ ] T150 [P] [US5] Write Playwright `tests/e2e/us5-branding.spec.ts`:
  - Login and shell show the correct tenant name and logo per host; the no-logo tenant shows the neutral icon.
  - `<title>`, the `icon` link and the manifest show only the tenant name or neutral assets.
  - The DOM, title and metadata contain none of the provider/product denylist strings (`tests/helpers/branding-denylist.ts`), nor "ERAK"/"إراك" on non-ERAK tenants.
  - The manager uploads, replaces and removes the logo.
  - Staff and delegates get no branding nav item, and a forged server action is denied.

  (FR-035–FR-037, SC-008)
- [ ] T151 [P] [US5] Write `tests/security/logo-storage.test.ts`:
  - Server-side rejection of a disallowed MIME, an extension/magic-byte mismatch, an oversized file, corrupt image data and oversized dimensions.
  - A tenant-A JWT cannot list or read `tenant-logos/<B>/…` or `tenant-private/<B>/…` through the Storage API.
  - The `/branding/logo` route on host A never serves B's logo.
  - Buckets are not public.

  (FR-034, Constitution IX)
- [ ] T152 [P] [US5] Write Playwright `tests/e2e/us5-i18n-theme.spec.ts`:
  - Default Arabic with `dir="rtl"`; switching to English gives `dir="ltr"` and survives a reload.
  - Usernames and emails render inside `bdi[dir=ltr]` and data is not rewritten.
  - System theme follows an emulated `prefers-color-scheme`; explicit Dark/Light persists across reload and across a second browser context (server-stored preference).
  - Before sign-in, preferences come from a cookie only.

  (FR-038, FR-039, US5 scenarios 3–4)
- [ ] T153 [P] [US5] Write Playwright + `@axe-core/playwright` `tests/accessibility/shell.a11y.spec.ts`:
  - Scan with WCAG 2.2 AA tags: login, invitation acceptance, recovery, shell, account, sessions, staff, roles, branding, audit and security logs (portal) and login, tenants and tenant details (admin), each in AR/RTL and EN/LTR × Light and Dark.
  - A keyboard-only traversal script asserts visible focus and dialog focus trap and return.
  - Reduced motion is respected.

  (FR-041, SC-007)
- [ ] T154 [P] [US5] Write the unit test `packages/ui/src/components/tenant-identity.test.tsx`: the neutral icon renders when there is no logo, alt text equals the organization name, and no default artwork exists (FR-035)

### Implementation for User Story 5

- [ ] T155 [US5] Create migration `supabase/migrations/<ts>_preferences_branding.sql`:
  - `public.tenant_preferences`: `tenant_id`, `staff_id` pk, `locale text check (locale in ('ar','en'))`, `theme_mode text check (theme_mode in ('system','light','dark'))`, `updated_at`, with a composite FK.
  - `public.get_my_preferences()` and `public.set_my_preferences(p_locale, p_theme)`.
  - `public.update_tenant_branding(p_display_name text, p_logo_object_path text, p_remove_logo bool)`: requires `is_active_tenant_manager()` only, never a grantable permission; validates the name; increments `logo_version`; audited under `tenant_settings`.
  - `public.platform_update_tenant_logo(p_tenant_id, p_logo_object_path, p_remove bool)`: requires `tenants.manage`; audited on both sides.

  (FR-036, FR-039)
- [ ] T156 [US5] Implement `packages/config/src/branding.ts` (approved logo MIME allowlist, max bytes, max dimensions and name constraints, sourced from `docs/decisions/branding.md`) and `apps/portal/src/features/branding/validate-logo.ts` (magic-byte sniffing, dimension read via `sharp`, metadata stripped by re-encoding) ⛔ GATE-BRAND (Constitution IX)
- [ ] T157 [US5] Implement the branding settings page `apps/portal/src/app/(app)/settings/branding/page.tsx` (behind `requireManager()`: name field, logo upload/replace/remove with preview and accessible labels) and `apps/portal/src/features/branding/actions.ts`:
  1. Validate the logo.
  2. Upload via the service role to `tenant-logos/<tenant_id>/<uuid>.<ext>`.
  3. Call `update_tenant_branding`.
  4. Delete the previous object after commit.

  (FR-036, US5 scenario 2)
- [ ] T158 [P] [US5] Implement logo delivery `apps/portal/src/app/branding/logo/route.ts`. Resolve the tenant from the host only, stream the object with the service role, set `Cache-Control` keyed by `?v=<logo_version>` and `X-Content-Type-Options: nosniff`, and return 404 when no logo exists. Mark the route `passive` so it never counts as activity (FR-035, CL-036)
- [ ] T159 [P] [US5] Implement admin logo intervention: `apps/admin/src/app/(app)/tenants/[tenantId]/branding-panel.tsx`, `apps/admin/src/features/tenants/logo-actions.ts` and a preview route `apps/admin/src/app/(app)/tenants/[tenantId]/logo/route.ts` (FR-036)
- [ ] T160 [US5] Implement tenant identity on the portal surfaces in `apps/portal/src/app/`:
  - `apps/portal/src/app/(public)/layout.tsx`: `TenantIdentity` on login, invitation and recovery pages.
  - `generateMetadata` in `apps/portal/src/app/layout.tsx`: title = tenant display name, no provider name.
  - `apps/portal/src/app/icon.tsx`: tenant logo or neutral generated icon.
  - `apps/portal/src/app/manifest.ts`: tenant name, neutral icon.

  (FR-035, FR-037, Constitution IX)
- [ ] T161 [US5] Implement navigation `apps/portal/src/lib/navigation.ts`. Primary items: Home, Account, Settings (secondary sidebar: Staff, Roles, Branding), Audit Log, Security Logs. Each item declares its required permission or manager check and is filtered by `my_effective_permissions`. Home is a minimal welcome with no KPIs, charts, dashboard widgets or global search. Account is direct-entry with no empty secondary sidebar (FR-040, Constitution X, US5 scenario 6)
- [ ] T162 [US5] Implement the authenticated shell `apps/portal/src/app/(app)/layout.tsx` (`requireStaff()`, `AppShell` with filtered navigation, header with `TenantIdentity`, language and theme selectors, sign-out) and `apps/portal/src/app/(app)/page.tsx` (minimal localized home) (FR-040)
- [ ] T163 [US5] Implement preference persistence in `apps/portal/src/features/preferences/actions.ts`. Signed-in users write to `set_my_preferences` plus the `locale`/`theme` cookies; before sign-in, cookies only. The root layout reads the stored preference first. The admin app uses cookie persistence in `apps/admin/src/features/preferences/actions.ts` (FR-039, Constitution VIII)
- [ ] T164 [P] [US5] Audit both apps for mixed-direction content: wrap usernames, emails and record IDs with `LtrText` in `apps/portal/src/**` and `apps/admin/src/**`. Confirm every user-visible string comes from `packages/i18n` dictionaries (no hard-coded literals; add an ESLint `i18next/no-literal-string`-style rule in `eslint.config.mjs` scoped to `apps/*/src/app/**/*.tsx`) (FR-038, FR-041)
- [ ] T165 [P] [US5] Finalize the `packages/ui/src/styles/globals.css` palette with the owner-approved values. Verify contrast ratios with `scripts/check-contrast.mjs`, which computes WCAG ratios for every foreground/background token pair in both themes ⛔ GATE-BRAND (FR-037, FR-041)
- [ ] T166 [US5] Run `tests/e2e/us5-branding.spec.ts`, `tests/e2e/us5-i18n-theme.spec.ts`, `tests/security/logo-storage.test.ts`, `tests/accessibility/shell.a11y.spec.ts` and `packages/ui/src/components/tenant-identity.test.tsx` until T150–T154 pass

**Checkpoint**: A white-label, bilingual, accessible shell with manager-only branding works for two tenants.

---

## Phase 8: User Story 6 — Authorized staff review important administrative history (Priority: P1)

**Goal**: Delivers:
- complete, safe audit coverage of in-scope administrative events;
- a category-scoped tenant audit viewer (list, detail, filter, search, counts, pagination, export);
- a manager-only tenant Security Log;
- a separate platform audit;
- append-only storage with 12-month administrative and 3-month security retention under legal-hold control;
- no read-only business audit events.

**Independent Test**: Perform administrative changes in two tenants and in platform administration. Confirm actor, time, scope and event coverage, category-limited viewing including counts and exports, manager-only Security Logs, no cross-tenant or platform leakage, and tamper protection.

### Tests for User Story 6 (write first, must FAIL) ⚠️

- [ ] T167 [P] [US6] Write pgTAP `supabase/tests/060_audit_access.test.sql`:
  - A delegate with `audit_logs.view` and categories `{staff,roles}` sees only those categories in rows, `total_count`, detail fetches and export, and never `tenant_settings`, other tenants or platform events.
  - `audit_logs.view` with null or empty categories returns nothing.
  - A manager sees all tenant administrative categories.
  - `list_security_events` works for an active manager only; a delegate holding `audit_logs.view`, any staff member, a demoted manager and another tenant's manager are denied.
  - A platform admin without tenant access cannot read tenant audit; `platform_list_audit` requires `platform_audit.view`.

  (FR-031, FR-033, CL-032, CL-035, SC-006)
- [ ] T168 [P] [US6] Write pgTAP `supabase/tests/061_audit_retention.test.sql`:
  - `private.purge_expired_audit()` deletes tenant administrative events older than 12 months and security events older than 3 months.
  - It keeps events covered by `audit_legal_holds`, never touches other tenants' unexpired rows, and writes a `retention.purged` platform event with counts only.
  - Direct DELETE remains impossible.

  (FR-033, CL-033, CL-034)
- [ ] T169 [P] [US6] Write `tests/security/audit-coverage.test.ts`. Run every in-scope operation:
  - tenant create, state change and name change;
  - manager grant and revoke;
  - staff invite, resend and redeem;
  - username change;
  - role create, update, archive and restore;
  - staff role changes, disable and enable;
  - branding change;
  - session revoke and revoke-others;
  - recovery issue and complete;
  - platform-admin invite and accept;
  - bootstrap.

  Assert each yields exactly one event in the correct log, with actor, time, tenant/context and safe ids, and that serialized metadata has no token, password or secret patterns. Denied privileged attempts must yield security events. Plain protected page views must produce NO audit event (FR-030, FR-032, SC-006, Constitution VI)
- [ ] T170 [P] [US6] Write `tests/security/audit-export.test.ts`. The export obeys categories and filters. When the permission is revoked between list load and export, the export is denied (stale client state). The pagination and count endpoints leak no other categories (edge case "Audit viewer loses permission")
- [ ] T171 [P] [US6] Write Playwright `tests/e2e/us6-audit.spec.ts`. The category-limited delegate sees a filtered list and export. The manager sees the full administrative list plus Security Logs. Staff get no navigation entry and are denied on a direct URL. Platform audit appears in the admin app only (US6 scenarios 1–6)

### Implementation for User Story 6

- [ ] T172 [P] [US6] Implement `packages/authorization/src/audit-categories.ts`: tenant administrative categories `staff|invitations|roles|tenant_settings|sessions|tenant_lifecycle` and security event types `auth.sign_in_failed|authz.denied|authz.privilege_escalation_denied|session.invalid_reuse`, per T021 ⛔ GATE-RBAC. Add a DB check constraint in a new migration `supabase/migrations/<ts>_audit_category_constraints.sql`, so no unapproved category can be emitted (plan "NON-ADMIN RETENTION")
- [ ] T173 [US6] Create migration `supabase/migrations/<ts>_audit_read_rpcs.sql`:
  - `public.list_tenant_audit(p_categories text[], p_from timestamptz, p_to timestamptz, p_actor uuid, p_search text, p_limit int, p_offset int)`. It returns rows plus `total_count`, both computed AFTER intersecting with `private.audit_categories_for_actor()` (all administrative categories for an active manager), and requires `request_context_ok()`.
  - `public.get_tenant_audit_event(p_id)`: the same filter.
  - `public.export_tenant_audit(...)`: the same filter and row cap; writes an `audit.exported` event.
  - `public.list_security_events(...)` and `public.get_security_event(p_id)`: `is_active_tenant_manager()` only, never via any grant.
  - `public.platform_list_audit(...)`: requires `platform_audit.view`.

  (FR-031, FR-033, CL-032, CL-035)
- [ ] T174 [US6] Create migration `supabase/migrations/<ts>_audit_retention.sql`: `private.purge_expired_audit()`, which sets `app.retention_purge='on'` locally, deletes tenant administrative events older than 12 months and security events older than 3 months that are not covered by `audit_legal_holds`, and writes a platform audit summary. Schedule it daily with `cron.schedule('purge-expired-audit', '17 3 * * *', $$select private.purge_expired_audit()$$)` (FR-033, CL-033, CL-034)
- [ ] T175 [US6] Implement the tenant audit viewer `apps/portal/src/app/(app)/audit/page.tsx`: filters limited to the actor's categories, date range, actor and search, pagination, and a detail `Sheet` showing safe metadata only. Add `apps/portal/src/features/audit/actions.ts` and an export route `apps/portal/src/app/(app)/audit/export/route.ts` that re-checks authorization at request time and streams CSV with safe columns (FR-031, US6 scenarios 1–2a)
- [ ] T176 [US6] Implement Security Logs `apps/portal/src/app/(app)/security-logs/page.tsx` behind `requireManager()`: list, detail and export via `list_security_events`, never linked or authorized via `audit_logs.view` (FR-033, CL-035)
- [ ] T177 [P] [US6] Implement platform audit `apps/admin/src/app/(app)/audit/page.tsx` behind `requirePlatformAdmin('platform_audit.view')`, showing platform events only with no tenant-private content (FR-031, US6 scenario 4)
- [ ] T178 [US6] Wire security-event emission. Guards in `apps/portal/src/lib/guards.ts` and `apps/admin/src/lib/platform-guards.ts` emit `authz.denied`. Sign-in emits `auth.sign_in_failed`. Revoked or expired session reuse emits `session.invalid_reuse`. Rate-limit each identical event per actor to avoid log flooding. Raw identifiers, IPs and tokens are never stored (FR-033, CL-034)
- [ ] T179 [P] [US6] Add AR/EN strings for audit categories, event names, filters and empty states to `packages/i18n/src/dictionaries/{ar,en}.ts`
- [ ] T180 [US6] Run `supabase/tests/060_audit_access.test.sql`, `supabase/tests/061_audit_retention.test.sql`, `tests/security/audit-coverage.test.ts`, `tests/security/audit-export.test.ts` and `tests/e2e/us6-audit.spec.ts` until T167–T171 pass

**Checkpoint**: Administrative history is complete, safe, category-scoped and tamper-resistant across tenant and platform logs.

---

## Phase 9: User Story 7 — Operators can release and recover the platform safely (Priority: P1; launch gate)

**Goal**: Delivers:
- Development and Production as separate environments;
- reviewable migrations and releases with a hard release gate;
- daily database + required Storage backups retained for a rolling 30 days;
- isolated restore rehearsal before launch and every 3 calendar months;
- restore execution restricted to authorized operators, never through the app.

**Independent Test**: Complete a documented non-production deployment and migration plus an isolated restore rehearsal covering stored files with recorded evidence. Show that the release gate blocks Production when evidence is missing, and that no UI or API can trigger a restore.

⛔ GATE-OPS (T023) must be approved; Production launch is blocked until this phase is complete.

### Tests for User Story 7 (write first, must FAIL) ⚠️

- [ ] T181 [P] [US7] Write `tests/security/environment-isolation.test.ts`. `packages/config` rejects `APP_ENV=development`/`test` when the Supabase URL matches the configured Production project ref (`PRODUCTION_SUPABASE_REF` deny value). The test harness refuses non-local URLs. `.env.example` files contain no real keys (FR-043, US7 scenario 2)
- [ ] T182 [P] [US7] Write pgTAP `supabase/tests/070_restore_authority.test.sql`. No `public` function performs restore or backup operations. `recovery_evidence` cannot be read or written by `anon`/`authenticated` (including platform admins and tenant managers); only the service role or the ops role can write (FR-045, CL-045, SC-009)
- [ ] T183 [P] [US7] Write `scripts/release/check-release-gate.test.mjs`. The gate fails when a required item is missing: CI green on the release SHA, migration review approval, a successful pre-launch restore rehearsal, the latest rehearsal within 3 calendar months, the 30-day daily backup coverage report, approved RPO/RTO, or a rollback plan. It passes when all are present (FR-044, FR-045, CL-046, CL-047, US7 scenario 1)

### Implementation for User Story 7

- [ ] T184 [US7] Create migration `supabase/migrations/<ts>_recovery_evidence.sql`: `public.recovery_evidence` (`id`, `environment text check in ('production','development')`, `kind text check in ('rehearsal','production_restore')`, `recovery_point timestamptz`, `operator_ref`, `approval_ref`, `scope text`, `db_verified bool`, `files_verified bool`, `tenant_isolation_verified bool`, `result text check in ('success','failure')`, `remediation_ref null`, `occurred_at`). RLS forced; no policies for anon/authenticated. Insert via `scripts/ops/record-restore-evidence.ts` only (FR-045, CL-047)
- [ ] T185 [P] [US7] Write `docs/operations/environments.md`: separate Dev/Prod Supabase projects (DB/Auth/Storage), separate credentials in the secret manager, separate admin and portal deployments per environment, no standing staging, no Production data copied to Dev, generated test data only (FR-043, Constitution XIII)
- [ ] T186 [P] [US7] Write `docs/operations/release.md`:
  - The migration workflow: `supabase migration new` → review → `supabase db reset` + `supabase test db` in CI → expand/contract compatibility → `supabase db push` to Dev → evidence → Production.
  - Deploy order: migrations → admin → portal.
  - The rollback/recovery plan template for risky releases.
  - The required evidence list.

  (FR-045, Constitution XIII)
- [ ] T187 [US7] Implement `scripts/release/check-release-gate.mjs`. It reads `docs/operations/release-evidence/<release-id>.json` (create the schema `docs/operations/release-evidence/schema.json`) and the latest `recovery_evidence` export, and exits non-zero with a precise list of missing items. Add the manual Production workflow `.github/workflows/release-production.yml` (GitHub Environment `production` with required reviewers). It runs the gate before any deploy step; the deploy step is a placeholder until GATE-OPS selects hosting ⛔ GATE-OPS (US7 scenario 1)
- [ ] T188 [P] [US7] Write `docs/operations/backup.md`: daily DB recovery points via the verified Supabase plan feature or an approved scheduled `pg_dump`, a separate Storage object backup (all buckets including `tenant-logos` and `tenant-private`), a rolling 30-day retention, encryption and restricted access, monitoring and alerting, and the verified plan capabilities ⛔ GATE-OPS (FR-044, CL-046)
- [ ] T189 [US7] Implement `scripts/ops/backup-storage.ts`, a Storage object backup job. It enumerates all buckets and objects with the service role, copies them to the approved encrypted backup target, and writes a manifest with checksums per run. Implement `scripts/ops/verify-backups.ts`, which checks one DB recovery point plus one Storage manifest per day for the last 30 days, that expiry never removes points newer than 30 days, and outputs a coverage report for the release gate. Both are blocked by ⛔ GATE-OPS (target/provider) (FR-044, CL-046, SC-009)
- [ ] T190 [P] [US7] Write `docs/operations/restore-rehearsal.md`:
  - Restore into an isolated, non-Production project or local stack, never over Production.
  - Restore the DB and Storage objects from the same day's recovery point.
  - Verify per-tenant row counts and Storage checksums, then run `supabase test db` and the two-tenant RLS suite against the restored copy.
  - Record evidence via `scripts/ops/record-restore-evidence.ts` without confidential content.
  - Track failure remediation and re-testing.
  - Keep the schedule: before launch, then every 3 calendar months.

  (FR-045, CL-047, SC-009)
- [ ] T191 [P] [US7] Write `docs/operations/restore-request.md`: the intake procedure when a tenant manager reports lost or corrupted data, request verification, backup integrity check, an all-tenant impact assessment for the shared DB, the approval chain, isolated-restore-first, no unilateral overwrite or implicit cross-tenant rollback, and audited outcome. It states that no app UI or API can execute restores (FR-045, CL-045, US7 scenarios 4–5)
- [ ] T192 [P] [US7] Implement `scripts/ops/record-restore-evidence.ts` (`OPS_CONFIRM`, `OPERATOR_REF`; inserts `recovery_evidence` and a platform audit event, never logging restored content) (CL-045, CL-047)
- [ ] T193 [P] [US7] Write `docs/operations/retention.md`: tenant administrative audit 12 months, Security Logs 3 months, the legal-hold procedure via `audit_legal_holds` with approvals, backup lifecycle 30 days, the statement that other categories need an approved policy before emission, and the rule that no manual purge is allowed (FR-033, CL-033, CL-034, CL-046)
- [ ] T194 [US7] Write `docs/operations/go-live-checklist.md`, mapping Constitution §XIV, SC-001..SC-010, research gates, GATE-* approvals and quickstart.md "Go-live prohibition" to evidence links. Production with private data is forbidden until every item is checked (FR-044, FR-045)
- [ ] T195 [US7] Run `tests/security/environment-isolation.test.ts`, `supabase/tests/070_restore_authority.test.sql` and `scripts/release/check-release-gate.test.mjs` until T181–T183 pass. Then perform one isolated restore rehearsal in Development following `docs/operations/restore-rehearsal.md` and record it with `scripts/ops/record-restore-evidence.ts` to validate the runbook end to end

**Checkpoint**: Release and recovery readiness are documented, scripted and gated. Production launch remains blocked until real Production evidence exists.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Whole-system adversarial verification, scope and branding inspection, documentation, and acceptance evidence across all stories.

- [ ] T196 [P] Write `tests/security/cross-tenant.test.ts`, a full two-tenant matrix. For every `public` table and every RPC, use a tenant-A staff JWT to attempt SELECT, INSERT, UPDATE and DELETE on tenant-B data, FK references to B ids, exports and Storage reads. Also check platform admin access to tenant-private data and the audit tables. All attempts must fail and leak nothing (SC-001, security-matrix tests 1, 8)
- [ ] T197 [P] Write Playwright `tests/e2e/suspension-active-session.spec.ts`. A signed-in tenant-A browser session gets denied on the next navigation and server action once the platform suspends A; tenant B is unaffected; after reactivation, A signs in again under its existing roles (SC-002, US1 scenarios 4–5)
- [ ] T198 [P] Write `tests/security/log-redaction.test.ts`. Run sign-in, invitation, recovery, reset and revocation flows with captured server logs and assert that no tokens, passwords, JWTs, service keys or cookie values appear (FR-017, Constitution XIV-7)
- [ ] T199 [P] Write `scripts/check-scope.mjs` (wired into `pnpm lint`). It fails if migrations or code introduce tables or routes for beneficiaries, donors, donations, volunteers, accounts, services, subscriptions, plans, invoices or payments; a tenant color picker; custom domains; MFA/2FA; tenant deletion; tenant switching; dashboards/KPIs; or global search. Exclude `docs/design-references/**`, which holds non-binding prototypes that mention future modules by name. Add the manual checklist `docs/operations/scope-review.md` (SC-010, Constitution XI/XII)
- [ ] T200 [P] Write `scripts/check-branding.mjs`. It scans built portal HTML, metadata, manifest, email template outputs and response headers for the provider/product denylist and default framework assets, and fails on a match. Wire it into `.github/workflows/ci.yml` (FR-037, SC-008, Constitution IX)
- [ ] T201 [P] Write the manual screen-reader checklist `tests/accessibility/manual-checklist.md` (NVDA + VoiceOver, AR and EN, all foundation screens) and record the first pass results (FR-041, SC-007)
- [ ] T202 Run `supabase db lint` and the Supabase security/performance advisors. Add missing indexes for policy and FK columns in `supabase/migrations/<ts>_indexes_and_advisors.sql`. Record `EXPLAIN ANALYZE` for `private.request_context_ok()`, `has_permission()` and `list_tenant_audit` on a seeded dataset in `docs/operations/performance-baseline.md` (a measured baseline, not an invented SLA) (plan "Performance")
- [ ] T203 Finalize the CSP and security headers in `apps/portal/next.config.ts` and `apps/admin/next.config.ts`: nonce-based script CSP, `frame-ancestors 'none'`, a strict `connect-src` limited to the environment's Supabase URL, `Permissions-Policy` denying geolocation, camera and microphone (CL-037) (Constitution III)
- [ ] T204 [P] Write the root `README.md`: purpose, workspace layout, prerequisites, local setup (`corepack enable`, `pnpm install --frozen-lockfile`, `supabase start`, `pnpm dev`), test commands, and links to `docs/operations/*` and `docs/decisions/*`, with no provider marketing copy
- [ ] T205 Update `specs/001-core-foundation/quickstart.md` with the real, runnable commands (Supabase test/migration commands, E2E hosts). Execute the 9-step demonstration acceptance script end to end in Development and record the results in `docs/operations/acceptance-evidence.md` (SC-001..SC-010)
- [ ] T206 Update `specs/001-core-foundation/research.md` (tick the research gates, linking evidence) and the `specs/001-core-foundation/plan.md` "Constitution Check" with the post-implementation re-check. List any remaining open decisions (GATE-*) as explicit launch blockers
- [ ] T207 Run a final security review of the full diff (`/security-review`) and a cross-artifact consistency check (`/speckit-analyze`). Resolve the findings and record the outcome in `docs/operations/security-review.md`

---

## Gate Register

| Gate | Closed by | Blocks (must not be accepted as secure/complete before closure) |
| --- | --- | --- |
| GATE-SPEC | T017 + owner sign-off — **CLOSED 2026-10-15** | — (spec aligned with Constitution v2.0.1 and owner-approved) |
| GATE-AUTH | T018, T019, T020 + security review | T032, T049, T117, T120, T132 and acceptance of US2, US3, US1 demotion revocation (T080) |
| GATE-RBAC | T021 + owner approval | Final seed in T031, ceiling helpers in T034, T051, T121, T141, T172, and production grants |
| GATE-ABUSE | T020 (`docs/decisions/auth-abuse-controls.md`) + owner approval | Limit values in T112, acceptance of T113, T119 and T102 |
| GATE-BRAND | T022 + owner approval (palette basis, per-theme accent and Cairo/Inter fonts already decided 2026-10-15) | T064 (final values), T156, T165 |
| GATE-OPS | T023 + operator/owner approval | T056 production mail adapter, T187 deploy step, T188, T189, Production launch |
| GATE-COLLIDE | T024 + owner decision | T028 trigger, T091 acceptance rule |

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Can start immediately (plan: S0 may start after baseline review).
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories.** 2A gate tasks run in parallel with 2B/2C/2D, but T032/T049 need T018's result.
- **User stories (Phases 3–9)**: All depend on Phase 2 only. They can then proceed in parallel, or sequentially in spec order US1 → US7.
- **Polish (Phase 10)**: Depends on all user stories being complete.

### User Story Dependencies

| Story | Hard dependency | Integrates with (optional, tested independently via fixtures) |
| --- | --- | --- |
| US1 Platform onboarding (MVP) | Phase 2 | US2 for real manager activation (US1 test uses the mail catcher + fixtures) |
| US2 Invitations & sign-in | Phase 2 | US4 roles (fixtures supply roles), US3 (revocation on recovery uses foundation `revoke_sessions`) |
| US3 Sessions | Phase 2 | US2 sign-in (tests use fixture `signIn`) |
| US4 Staff & roles | Phase 2 | US2 reset entry point (T120) on the staff page; US2 invite (T110) for lost-mailbox test T104 |
| US5 Shell & branding | Phase 2 | Navigation links to pages from US2/US3/US4/US6 (render only when those exist) |
| US6 Audit | Phase 2 (append-only writer) | Coverage test T169 exercises operations from US1–US5; run it after those stories |
| US7 Operations | Phase 2 + GATE-OPS | None |

### Within Each User Story

- Tests are written first and must FAIL.
- Migrations → regenerate types → server actions → pages/UI → strings → make tests pass.
- SQL RPCs own the atomicity, authorization and audit. Server actions only orchestrate (tokens, Auth Admin API, email).

---

## Parallel Opportunities

- **Phase 1**: T003, T004, T005, T007, T009, T010, T012–T016 in parallel after T001/T002/T006/T008.
- **Phase 2**: The 2A gate drafts (T019–T024) run in parallel. pgTAP suites T038–T041 run in parallel once the migrations exist. Package work T042–T045, T048, T052–T055 and UI/i18n work T062–T066 run in parallel.
- **Across stories**: After Phase 2, US1, US2, US3, US4, US5, US6 and US7 can be staffed independently. Migrations from different stories must still be merged in a single linear timestamp order.
- **Within stories**: All test tasks marked [P] run in parallel. UI/strings tasks marked [P] run in parallel after the RPC migration lands.

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (they must fail first):
Task: "pgTAP tenant lifecycle in supabase/tests/010_tenant_lifecycle.test.sql"
Task: "pgTAP manager authority in supabase/tests/011_manager_authority.test.sql"
Task: "Manager revocation race in tests/security/manager-revocation-race.test.ts"
Task: "pgTAP platform invitations in supabase/tests/012_platform_admin_invitations.test.sql"
Task: "Bootstrap one-time test in tests/security/platform-bootstrap.test.ts"
Task: "E2E onboarding in tests/e2e/us1-tenant-onboarding.spec.ts"

# After migrations T079–T082 + types T083, run in parallel:
Task: "Tenant directory in apps/admin/src/app/(app)/tenants/page.tsx"
Task: "Bootstrap script + runbook in scripts/ops/bootstrap-platform-admin.ts"
Task: "Revoke script + runbook in scripts/ops/revoke-platform-admin.ts"
Task: "Provisioning runbook in docs/operations/tenant-provisioning.md"
```

## Parallel Example: User Story 2

```bash
Task: "Username validator tests in packages/auth/src/username.test.ts"
Task: "pgTAP invitations in supabase/tests/020_staff_invitations.test.sql"
Task: "pgTAP username/email in supabase/tests/021_username_and_email.test.sql"
Task: "pgTAP recovery in supabase/tests/022_recovery.test.sql"
Task: "Invitation races in tests/security/invitation-races.test.ts"
Task: "Recovery races in tests/security/recovery-races.test.ts"
Task: "Login enumeration in tests/security/login-enumeration.test.ts"
```

## Parallel Example: User Story 4

```bash
Task: "pgTAP roles in supabase/tests/040_roles.test.sql"
Task: "pgTAP staff admin in supabase/tests/041_staff_admin.test.sql"
Task: "pgTAP record scope in supabase/tests/042_record_scope.test.sql"
Task: "Role races in tests/security/role-races.test.ts"
Task: "Privilege escalation in tests/security/privilege-escalation.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational). Close GATE-AUTH proofs T018–T020 early, because they decide the session and identity design.
3. Complete Phase 3 (US1): platform admins can onboard, suspend and reactivate tenants and govern manager authority.
4. **STOP and VALIDATE**: run the US1 independent test (T073–T078) and demo the admin app in Development.

### Incremental Delivery

1. Setup + Foundational → foundation ready (isolated tenants, live-session guard, append-only audit).
2. US1 → platform onboarding demo (MVP).
3. US2 → staff can activate, sign in and recover (first usable tenant portal).
4. US3 → long-lived, revocable multi-device sessions.
5. US4 → RBAC administration (the prerequisite for any future business module).
6. US5 → complete white-label bilingual accessible shell.
7. US6 → audit viewing and retention.
8. US7 → release/recovery gate. **Production launch only after US7 evidence and all GATE-* closures.**

### Parallel Team Strategy

1. The team completes Setup + Foundational together. One person owns the GATE-AUTH proofs.
2. After that:
   - Developer A: US1 → US7 (platform/ops).
   - Developer B: US2 → US3 (identity/sessions).
   - Developer C: US4 → US6 (authorization/audit).
   - Developer D: US5 (UI/i18n/a11y).
3. Merge migrations in one linear order. Run `supabase db reset && supabase test db` on every merge.

---

## Notes

- [P] tasks touch different files and have no dependency on incomplete tasks.
- The [Story] label maps each task to a spec user story. FR/CL/SC references give traceability (plan "Deliverables for /speckit.tasks").
- Never skip, disable or weaken a security test to make it pass. A failing proof gate pauses the dependent work (Constitution: "Stop affected implementation if a mandatory property lacks a verified approach").
- Do not invent business fields, dashboards, payment flows, tenant colors, custom domains, MFA or tenant deletion (SC-010).
- Commit after each task or logical group, and stop at any checkpoint to validate a story on its own.
