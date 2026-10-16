# Implementation Roadmap — Development-first MVP

**Status:** Owner-approved sequencing (2026-10-16)
**Decision:** [DELIVERY-001](../decisions/development-first-production-readiness.md)
**Scope:** Sequencing only; domain details must be established in approved Feature Specs.

## Milestones

| Order | Milestone | Definition |
| --- | --- | --- |
| 0 | Core Foundation — secure Development baseline | Verify shared Supabase Cloud Development, tenant routing/Auth/RBAC/RLS, 2-tenant isolation and relevant session/secrets/Storage security tests before dependent module code; use synthetic data. Remaining Production launch work stays open. |
| 1 | Beneficiaries module | Discover and approve its own spec, domain model, record scopes, audit/privacy rules, migrations and tests; implement/accept in Development. |
| 2 | Volunteers module | Approve independent spec and build/test in Development; volunteer records are not V1 login accounts. |
| 3 | Donors module | Approve independent spec and build/test in Development; donor records are not login accounts, and the donations/finance workflow is not implicitly approved. |
| 4 | Production readiness and launch | Complete outstanding Production-dependent Foundation tasks and other launch gates. Purchase/configure domain and separate Production Supabase plan, complete automated DB+Storage backup/recovery validation, production deployment and release evidence. |

## Explicit limits

- This order replaces the previously undecided **business-module sequence** for these three modules; it does **not** auto-approve fields, tasks, donation handling, services, accounting, reports, subscription billing, or custom workflows.
- **Tasks Management** is not included among the three; decide its scope and priority separately.
- Maintain all mandatory Constitution tenant-security, privacy, accessibility, testing and audit controls throughout Development.
- Do not mark deferred Foundation tasks as complete. The Production go-live gate remains closed until its evidence is verified.
- Refer to [the delivery decision](../decisions/development-first-production-readiness.md) for the detailed separation of Development work and Production-only work.
