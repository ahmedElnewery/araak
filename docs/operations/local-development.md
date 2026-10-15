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
2. Copy `.env.example` to `.env.local` (root) and the app `.env.example` files to `apps/*/.env.local`; fill values from the Supabase dashboard. Real values stay out of version control.
3. `supabase login` (or set `SUPABASE_ACCESS_TOKEN`), then `supabase link --project-ref $SUPABASE_DEV_PROJECT_REF`.
4. `pnpm db:check-env` — fails unless the target is the Development project and not Production.
5. `pnpm db:push` — applies `supabase/migrations/*` to the Development project. `supabase config push` applies `supabase/config.toml` Auth settings.
6. `pnpm db:types` — regenerates `packages/db/src/database.types.ts`.
7. `pnpm --filter @workspace/portal dev` and `pnpm --filter @workspace/admin dev`.

## Safety rules

- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN` are server/test-only secrets: never `NEXT_PUBLIC_`, never committed, never logged.
- Destructive tests and DB pushes run through `scripts/assert-dev-environment.mjs`, which requires `SUPABASE_ENV=development` and a project ref that is not Production.
- Production migrations and data changes need explicit owner approval and are never run from tests or from this workflow.
- Tests create their own isolated tenants (two disjoint tenants minimum) and clean up what they create.
