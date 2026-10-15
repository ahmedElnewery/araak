# Remove a platform admin (CL-041)

Platform admins cannot be removed, demoted or disabled from any application screen or API. Removal is an operations action with `scripts/ops/revoke-platform-admin.ts`.

## Authorization chain

1. A written request from the project owner (or, for an emergency, the on-call operator who then informs the owner within one business day), recorded in a ticket (`TICKET_REF`).
2. An operator from the operations register runs the script. The operator is recorded as `OPERATOR_REF`.

## Verify identity first

Confirm the person being removed (and the requester) out of band. Never act on an email alone.

## Run

```sh
OPS_CONFIRM=yes OPERATOR_REF=<ref> TICKET_REF=<ticket> TARGET_EMAIL=<email> \
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
node scripts/ops/revoke-platform-admin.ts
```

The account is disabled, every session of it ends immediately, and the platform audit records the operator, the ticket and the emergency flag (no secrets).

## Last-admin protection and the emergency path

The script refuses to remove the last enabled admin who holds `tenants.manage`, because nobody could then manage organizations. If that admin is compromised, set `EMERGENCY=yes` and bootstrap or invite a replacement immediately afterwards. Record why the emergency path was used.

## Evidence to keep

The ticket, the requester and the identity-verification notes, the operator, the time, and the `platform_admin.revoked_by_ops` audit event.
