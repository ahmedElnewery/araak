# Specification Quality Checklist: Core Foundation

**Purpose:** Validate completeness and readiness before invoking /speckit.plan.  
**Created:** 2026-10-15  
**Feature:** [spec.md](../spec.md)  
**Review state:** Draft — owner sign-off and blocking clarifications still required.

## Content Quality

- [x] Focused on user-visible behavior, security outcomes, operational prerequisites, and business value.
- [x] Mandatory Spec Kit sections completed: user scenarios, functional requirements, entities, measurable success criteria, assumptions.
- [x] Technical implementation is not prescribed beyond architecture/security constraints already ratified in the Constitution.
- [x] Scope separates Core Foundation from later business modules.

## Requirement Completeness

- [ ] All [NEEDS CLARIFICATION] markers resolved: G-01, G-02 and G-03 remain open.
- [x] Requirements have unique FR identifiers and behavior that can be evaluated.
- [x] Success criteria SC-001 through SC-010 have observable pass/fail outcomes.
- [x] User stories include independent test descriptions and Given/When/Then acceptance scenarios.
- [x] Edge and negative authorization/security cases are identified.
- [x] In/out of scope is explicit and respects the ratified Constitution v1.0.0.
- [x] External dependencies and technical feasibility prerequisites are called out.

## Feature Readiness

- [ ] **G-01 / critical:** Supabase Auth feasibility proof supports independent accounts sharing one real email across tenants.
- [ ] **G-02:** Within-tenant verified-email uniqueness APPROVED (CL-001); self-service username change APPROVED (CL-002), with its extra verification requirement superseded by CL-011 (valid session only); seven-day / 168-hour single-use invitation validity APPROVED (CL-003); administration-only manual resend with fresh seven-day validity and immediate invalidation of previous links APPROVED (CL-004); username alphabetic characters restricted to English/ASCII Latin (CL-005); previous letter/digit/underscore character set (CL-006) SUPERSEDED by CL-009: only ASCII English letters with `_` or `.`, NO digits or spaces, and a username must contain letters; length 3–30 characters inclusive APPROVED (CL-007; latest choice B superseded the earlier uncommitted choice C); case-insensitive tenant-local uniqueness and login APPROVED (CL-008). Placement of dot/underscore only as single separators between English-letter sequences, with letter-only beginning/end, APPROVED (CL-010). Username format is fully specified; username changes require no extra identity check (CL-011), but valid session and server authorization remain mandatory. Activated staff email immutability for employees and all administrators APPROVED (CL-012). Permanent mailbox-loss procedure APPROVED (CL-013): disable old account and revoke access; invite a new account with a new email and internal identity; retain old records/audits; no automatic record ownership handover. Replacement roles chosen explicitly afresh without copying/prefilling from the old account APPROVED (CL-014). Employees may ask a manager for password change/reset and password-only confirmation is requested (CL-015), but whose password is entered and the safe reset procedure remain OPEN. Initial email verification, resend rate limiting, invite cancellation, and other recovery lifecycle details remain unresolved. Verify secure seven-day expiry and resend enforcement in the Authentication Plan.
- [ ] **G-03:** Approved permission grant-authority safeguards and affected operational policies.
- [ ] Owner approves this specification as the basis for planning.
- [ ] Constitution compliance is rechecked after clarifications and again after the technical plan.
- [ ] Production-related backup/restore gate has an approved validation plan before launch.

## Reviewer Notes

This checklist intentionally marks unresolved decisions as **incomplete** rather than silently approving alternatives. No app source code, Supabase schema, or business-domain implementation is authorized by merely creating the draft spec. User Story 2 cannot be deemed implementable until G-01 has a security-reviewed working proof. User Story 7 is an operational launch gate, not a request to introduce a third persistent environment or invent subscription billing.

Next recommended action: /speckit.clarify against [spec.md](../spec.md), starting with G-01, followed by /speckit.plan only when the required decisions/feasibility have been resolved.
