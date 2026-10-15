# Core Foundation — Development and Verification Quickstart

**Status:** Planned developer workflow. The applications have NOT yet been scaffolded; do not interpret commands as currently runnable.

## Prerequisites
- Approved corrections to spec under Constitution 2.0.0.
- Pinned compatible Node.js LTS, pnpm, Supabase CLI and container runtime versions documented in the implementation PR.
- Dedicated Development Supabase project; Production keys never appear in developer .env files.
- Approved portal wildcard development hostname and separate platform-admin host; local DNS mapping chosen safely.
- Email/test inbox provider and a disposable two-tenant dataset.

## Planned setup (after S0 scaffolding)
~~~bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Supabase migrations/tests commands to be added after scripts and policy suites are committed.
~~~

## Configuration principles
- The two Next.js apps have different admin/portal allowed-host configuration, secrets and deployment surface.
- Public Supabase URL/anon/publishable config are not service-role secrets; privileged Supabase keys remain server/ops only.
- Supabase Development and Production use completely separate URL/keys/storage/auth/data, with exact deployment references managed outside version control.
- Treat session/hostname/permission helpers as server-only entrypoints. Ensure no service key enters a browser bundle.
- No third persistent staging environment unless constitution is amended.

## Demonstration acceptance script
1. Bootstrap first platform admin **through restricted operations**, verify second bootstrap attempt denied; invite another platform admin from platform app and confirm 24h single-use expiry.
2. Create two tenants A/B with distinct immutable subdomains, names, logos; verify fallback tenant, no platform branding, no tenant-selectable colors.
3. Invite manager/staff with distinct globally unique emails; deny cross-tenant duplicate pending/active/disabled reservations; allow identical usernames in different tenants.
4. Activate via email, log in with tenant username or email, change username, recover password; test invalid tokens, replay, quotas, email lock.
5. Open sessions in two browsers; verify activity, other-device revocation, revoke all other, 30d inactivity, reset-time logout, disabling and tenant suspension.
6. Create custom roles, assign two, deny self-role and assigned-role modification, archive in-use role, unauthorized manager grant and unauthorized audit categories.
7. Run SQL/Storage integration attacks against tenant boundaries; confirm platform admin cannot read tenant-private data.
8. Verify Arabic/English directions, themes, keyboard and screen reader, responsive layouts, provider-branding absence.
9. Validate migrations, two-environment separation, recovery point integrity, 30d DB+file backups, approval of RPO/RTO and isolated restore evidence.

## Go-live prohibition
No production private data until Auth/session proof, migration/RLS tests, spec/owner sign-off, documented provider-backed daily backups incl. Storage files, isolated prelaunch restore, and operator approvals are recorded. Schedule next restore exercise within three calendar months.
