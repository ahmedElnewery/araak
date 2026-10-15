# Development workflow (Supabase Cloud)

Development uses a dedicated **Supabase Cloud Development project**. Docker and a local Supabase stack are **not** required. Production is a separate project and is never used for development or tests (FR-043).

## Hosts

`*.localhost` resolves to loopback, so no hosts-file edits are needed.

| Surface | URL |
| --- | --- |
| Tenant portal | `http://<subdomain>.portal.localhost:3000` (e.g. `tenant-a.portal.localhost:3000`) |
| Platform admin | `http://admin.localhost:3001` |

Invitation and recovery emails come from the Development project's configured mail provider (the built-in sender is rate-limited; configure custom SMTP for heavy testing).

## Setup

1. `corepack enable && pnpm install`
2. Copy the three `.env.example` files to `.env.local` and fill them from the Supabase dashboard.
3. Migrations are applied to the Development project through the Supabase Management API with an access token (no database URL, password, Docker, CLI or MCP needed). Everything runs against the cloud Development project; nothing runs locally.
4. `pnpm db:check-env` — fails unless the target is the Development project and not Production.
5. Apply `supabase/migrations/*` in order through the Management API (`POST /v1/projects/{ref}/database/migrations`).
6. `pnpm db:types` — regenerates `packages/db/src/database.types.ts`.
7. `pnpm --filter @workspace/portal dev` and `pnpm --filter @workspace/admin dev`.

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
