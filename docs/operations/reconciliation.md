# Reconciling half-created accounts

Activation creates the Auth identity first and the staff row second (research.md R-01). The application deletes the Auth identity when the second step fails, but a crash between the two steps can leave an Auth user that has **no** `tenant_staff` and **no** `platform_admins` row. Such an account can never sign in to anything (the guard pipeline treats an identity without a staff or admin row as no access), yet it holds an email address.

`scripts/ops/reconcile-auth-users.ts` lists those accounts and deletes them only with `--apply`.

```sh
# report only
OPS_CONFIRM=yes OPERATOR_REF=<your-ref> NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
  node scripts/ops/reconcile-auth-users.ts

# delete what was reported
OPS_CONFIRM=yes OPERATOR_REF=<your-ref> NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
  node scripts/ops/reconcile-auth-users.ts --apply
```

- Only users older than **1 hour** are considered, so an activation in progress is never touched.
- The internal timing-pad identity used to equalize sign-in cost is ignored.
- The script never creates a staff or admin row and never grants access to an incomplete account.

## Scheduling

Run the report daily from a scheduled CI job or cron on a trusted runner with the service key held as a secret there (never in the repository), and review the output. Run `--apply` only after reading it. A non-empty report means an activation failed after the Auth user was created; check the application logs for the cause.
