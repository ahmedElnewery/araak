# Local development

## Hosts

`*.localhost` resolves to loopback, so no hosts-file edits are needed.

| Surface | URL |
| --- | --- |
| Tenant portal | `http://<subdomain>.portal.localhost:3000` (e.g. `tenant-a.portal.localhost:3000`) |
| Platform admin | `http://admin.localhost:3001` |
| Mail catcher (Supabase local SMTP) | `http://127.0.0.1:54324` |

## Steps

1. `corepack enable && pnpm install`
2. `supabase start` — starts the local Supabase stack (Docker required).
3. `supabase db reset` — applies `supabase/migrations/*` and seeds from scratch.
4. Copy `apps/portal/.env.example` and `apps/admin/.env.example` to `.env.local` and fill the values printed by `supabase status`.
5. `pnpm --filter @workspace/portal dev` and `pnpm --filter @workspace/admin dev`.
6. Open invitation, activation and recovery emails in the mail catcher.

## Rules

- Never use Production keys or URLs locally. Development and Production are separate Supabase projects (FR-043).
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed through a `NEXT_PUBLIC_` variable.
