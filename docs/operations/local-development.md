# Development workflow (Supabase Cloud)

Development uses a dedicated **Supabase Cloud Development project**. Docker and a local Supabase stack are **not** required. Production is a separate project and is never used for development or tests (FR-043).

## Hosts

`*.localhost` resolves to loopback, so no hosts-file edits are needed. The layout is the same as Production (`docs/operations/tenant-provisioning.md`), with `localhost:3000` in place of the domain: `PORTAL_BASE_DOMAIN=localhost:3000` in both apps, `ADMIN_HOST=admin.localhost:3001` in the admin app.

| Surface | Local URL | Production |
| --- | --- | --- |
| Platform admin | `http://admin.localhost:3001` | `admin.<domain>` |
| Araak organization (always exists) | `http://portal.localhost:3000` | `portal.<domain>` |
| Any other organization | `http://<subdomain>.localhost:3000` (e.g. `noor.localhost:3000`) | `<subdomain>.<domain>` |

The Araak tenant (subdomain `portal`) is created by migration `*_araak_portal_tenant.sql`, so it exists as soon as migrations are applied. `localhost:3000` itself and reserved labels (`www.localhost:3000`, `admin.localhost:3000`) return the neutral 404.

Invitation emails sent by the apps go through `SMTP_URL`. Start a local mail catcher with `docker compose up -d mailpit`, set `SMTP_URL=smtp://127.0.0.1:1025` in `apps/admin/.env.local`, and read the mail at http://localhost:8025. Nothing is delivered to real addresses.

Auth emails sent by Supabase itself (recovery, etc.) come from the Development project's configured mail provider (the built-in sender is rate-limited; configure custom SMTP for heavy testing).

## Setup

1. `corepack enable && pnpm install`
2. Copy the three `.env.example` files to `.env.local` and fill them from the Supabase dashboard.
3. Migrations are applied to the Development project through the Supabase Management API with an access token (no database URL, password, Docker, CLI or MCP needed). Everything runs against the cloud Development project; nothing runs locally.
4. `pnpm db:check-env` — fails unless the target is the Development project and not Production.
5. Apply `supabase/migrations/*` in order through the Management API (`POST /v1/projects/{ref}/database/migrations`).
6. `pnpm db:types` — regenerates `packages/db/src/database.types.ts`.
7. `pnpm --filter @workspace/portal dev` and `pnpm --filter @workspace/admin dev`.

## Manual check of the domain layout

1. Sign in at `http://admin.localhost:3001` (first platform admin: `docs/operations/bootstrap-platform-admin.md`).
2. Organizations: the Araak organization is already listed with subdomain `portal`. Open it, Managers, invite a manager email; the mail arrives in Mailpit with a `http://portal.localhost:3000/invite/accept?token=...` link. Accept it and sign in at `http://portal.localhost:3000`.
3. New organization: name, subdomain `noor`, manager email. Accept that invitation and sign in at `http://noor.localhost:3000`.
4. Trying to create another organization with `portal` fails ("subdomain taken"); `admin`, `www`, `araak` fail as reserved.
5. Each host keeps its own sign-in: auth cookies are host-only, so a session on `portal.localhost` is not sent to `noor.localhost` or `admin.localhost`.

## Tests (all against the Development project)

Export `SUPABASE_ENV=development`, `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` (a personal access token for the Management API) plus the three Supabase env vars from `.env.local`.

| Command | What it runs |
| --- | --- |
| `pnpm test` | Unit tests of every package (no network) |
| `pnpm test:db` | `supabase/tests/*.test.sql` (RLS, integrity, audit, sessions, reservations, grant ceiling) in rolled-back transactions through the Management API |
| `pnpm vitest run --root tests/security` | Guard pipeline, RLS through the real API, parity, race, host/cookie tests. `hosts-and-cookies` needs both apps running (`next start -p 3000` / `-p 3001` with `APP_ENV=development`, `PORTAL_BASE_DOMAIN`, `ADMIN_HOST`, `AUTH_THROTTLE_HMAC_KEY`) |
| `pnpm vitest run --root tests/proofs` | GATE-AUTH proofs R-01/R-02/R-03 (the R-03 file waits a real 300 s) |
| `pnpm db:types` / `pnpm db:types:check` | Regenerate / verify `packages/db/src/types.gen.ts` |
| `node scripts/check-contrast.mjs` | WCAG contrast of the fixed palette |

Next.js 16 uses `src/proxy.ts` (the renamed `middleware.ts`).

## Safety rules

- `SUPABASE_SECRET_KEY` are server/test-only secrets: never `NEXT_PUBLIC_`, never committed, never logged.
- Destructive tests and DB pushes run through `scripts/assert-dev-environment.mjs`, which requires `SUPABASE_ENV=development` and a project ref that is not Production.
- Production migrations and data changes need explicit owner approval and are never run from tests or from this workflow.
- Tests create their own isolated tenants (two disjoint tenants minimum) and clean up what they create.
