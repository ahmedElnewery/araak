# Decision: Platform admin vs tenant staff email collision

**Status: PENDING OWNER DECISION** (⛔ GATE-COLLIDE). The proposed default below is enforced in the database by default until the owner decides otherwise (T028).

## Problem
Supabase Auth keeps exactly one identity per email address per project. Platform admins and tenant staff both live in `auth.users`. If the same mailbox were both a platform admin and a tenant staff member, one Auth identity (one password, one session set) would hold two roles on two different surfaces, which breaks the independence the spec requires between platform and tenant accounts and violates the global email uniqueness decision (CL-048).

## Proposed safe default
An email cannot belong to both a platform admin and a tenant staff account.
- A trigger on `platform_admins` rejects an `auth_user_id` that is already linked in `tenant_staff` (T028), and a symmetric check rejects tenant activation of an email that belongs to a platform admin (in the shared reservation function, T030).
- The error is the same neutral `email_unavailable` used for every other collision; it never says which side owns the address.
- A person who needs both roles uses two distinct mailboxes.

## Alternatives considered
1. **One identity with two roles:** rejected (shared password and sessions across surfaces; larger blast radius).
2. **Separate Supabase projects for platform and tenants:** rejected (two Auth configurations and a cross-project session story for no gain in this scope).

## Approval

| | |
| --- | --- |
| Owner decision | ☐ Approve default ☐ Choose alternative: |
| Date / name | |
