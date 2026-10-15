# Bootstrap the first platform admin (CL-043)

The first platform admin is created **once**, by an operator, with `scripts/ops/bootstrap-platform-admin.ts`. No application screen, invitation link or route takes part, so there is nothing for an attacker to reach on the web.

## Who may run it

Only a named operator listed in the operations register (`docs/decisions/operations.md`), on an operations workstation, with the service-role key taken from the secret manager. The key is never pasted into chat, tickets or shell history (set it in the environment of the single command).

## Before you run it

1. Verify the target administrator's identity out of band (video call or in person, against an official ID).
2. Verify the target controls the mailbox (they read a one-time code back to you, or reply from it).
3. Agree the operator reference (`OPERATOR_REF`, e.g. the ticket id). It is written to the platform audit.

## Run

```sh
OPS_CONFIRM=yes OPERATOR_REF=<ticket> TARGET_EMAIL=<email> \
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
node scripts/ops/bootstrap-platform-admin.ts
```

The **target administrator** types their own password at the hidden prompt (no echo). The script never accepts it through argv or the environment and never logs or stores it. It must meet the policy: 8+ characters with lowercase, uppercase and digits.

The script refuses if any platform admin already exists. If the database function loses a race, the created Auth user is deleted again, so no orphan account remains.

## After

The administrator signs in through the normal admin login. Record as evidence: the ticket, who verified identity and mailbox, the operator, the time, and the `platform_admin.bootstrapped` platform audit event (it contains no secrets).
