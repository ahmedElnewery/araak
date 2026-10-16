# Decision: Develop three business modules before Production provisioning

**Status:** APPROVED — project owner decision (2026-10-16)
**Decision ID:** DELIVERY-001
**Applies to:** `001-core-foundation`, business-module roadmap, Production operations
**Related:** [Constitution](../../.specify/memory/constitution.md), [Core tasks](../../specs/001-core-foundation/tasks.md), [Operations decision](./operations.md), [Module roadmap](../product/module-roadmap.md)

## Decision

Use the existing **Supabase Cloud Development** project to complete a secure, working Foundation development baseline and then implement these three business modules, in this order:

1. **Beneficiaries**
2. **Volunteers**
3. **Donors**

Each module requires its own owner-approved Spec Kit specification, plan, data model, permissions, audits, tests, and acceptance criteria. This decision approves **sequencing**, not fields, business workflows, or speculative schemas. Tasks Management is **not** among the three modules and requires its own subsequent scope/prioritization decision.

**Defer purchasing and provisioning Production-specific infrastructure, and the remaining Production launch-readiness activities that depend on it, until after those three modules have been implemented and accepted in Development.** In particular, the project owner intends to buy/configure the Production domain and paid Supabase Production plan at that later stage. This decision does not cancel any requirements or mark incomplete Foundation tasks as complete.

## Work that proceeds now (Development)

- Continue using the **separate Supabase Cloud Development project** and existing Development credentials. "Buy Supabase later" means **Production capacity/plan**, not abandoning Development or switching to local Docker.
- Complete or verify the **Development-ready Foundation security baseline** before implementing a dependent module: working tenant routing/authentication and authorization, migrations and RLS, two-tenant negative isolation tests, suspended-account/session denial, secrets/log redaction, and relevant Storage controls. Resolve significant security findings rather than postponing them to launch.
- Implement and test the shared UI, Arabic/RTL and English/LTR, role scopes, audit requirements, and accessibility as each affected screen or module is built.
- Write and execute each module's tests during its own implementation; never defer module-specific tenant isolation, authorization, sensitive-data protection, or acceptance testing merely because Production is deferred.
- Development must use **synthetic or otherwise properly approved/sanitized data**, never copied live beneficiary/donor/private Production records.
- Where practical, the agent may write and test Production-operations code, documentation, CI guards, release-gate logic and restore tooling now; it must not block domain feature development merely because real Production purchase/credentials/evidence do not yet exist.

## Work deferred to the Production-readiness milestone

After the three modules are accepted in Development, complete and verify all outstanding Production-dependent requirements, including:

- Purchase/verify the domain; configure real portal/admin hostnames, wildcard DNS/TLS and trusted proxy behavior.
- Provision the **separate Production Supabase project and appropriate paid plan/capability**, plus Production hosting/mail/secrets and strict Development/Production isolation.
- Approve backup providers/targets, secure automated database **and Storage object** backups, retention, RPO/RTO, responsible operators, and the actual costs/plan capabilities.
- Execute isolated database-and-Storage restore rehearsal(s), gather real evidence and required backup coverage, validate rollback and release gates, and record approvals.
- Finish remaining applicable Foundation cross-cutting tests, operational documentation, audit/retention checks, reviews and go-live evidence; follow the latest relevant `tasks.md`.
- **Do not launch Production or enter real sensitive tenant data there until every Constitution §XIII–XIV and applicable Foundation gate is met.**

The Foundation `tasks.md` checkboxes remain the source of task completion status: pending means pending, regardless of scheduling. No security or recovery gate is waived, and deferred activities are not recorded as completed.

## Boundary between development and launch

**Development-ready** means a verified secure Foundation baseline sufficient to build/test approved business modules against synthetic Development data. It does **not** mean `001-core-foundation` is fully completed, that Production operations are approved, or that the portal is ready for live use.

**Production-ready** is a separate later milestone, subject to all previously approved constitutional and operational safeguards. If a blocker affects the safety of Development itself (such as cross-tenant access, broken RLS, or secret exposure), it must be resolved **before proceeding**, not deferred.

## AI agent execution guidance

1. Read this decision and `docs/product/module-roadmap.md` before scheduling Foundation follow-ups or starting business modules.
2. Distinguish `Development security/test blocker`, `implementable now`, and `Production-only deferred` for each incomplete Foundation task. Some task descriptions still mention Docker/local Supabase; follow the approved **cloud-only Development** convention at the top of `tasks.md`.
3. Do **not** automatically require a purchased domain, a paid Production plan, 30-day Production backup coverage, or Production restore evidence to begin the approved three modules **once the Development security baseline is verified**.
4. Do **not** suppress security tests, modify acceptance criteria to make failures disappear, treat business records as login accounts, or copy live private data into Development.
5. When returning to Production readiness, complete all deferred tasks and evidence, review vendor capabilities/costs, and request owner approval for still-open operational choices.

## Change control

This is an owner-approved scheduling decision, **not** a reduction in security, privacy, backup, or recovery requirements. A future change to the three-module sequence or live-data safety restrictions needs explicit owner approval. The current Constitution already defers module ordering to the implementation roadmap; its safeguards retain priority over this decision. No constitutional amendment is required by this scheduling decision.
