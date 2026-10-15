# Multi-Tenant Charity Management Portal — Project Constitution

**Version:** 2.0.0  
**Status:** Ratified  
**Created:** 2026-10-14  
**Last Updated:** 2026-10-15  
**Ratified:** 2026-10-15  
**Authority:** Project owner; governing document for Spec Kit

## Purpose and Authority

This constitution defines the non-negotiable product, engineering, security, architecture, user-experience, and delivery rules for a multi-tenant charitable-organization management portal. It governs feature specifications, technical plans, implementation tasks, code, and reviews.

- **MUST / MUST NOT** are mandatory and block acceptance if violated.
- **SHOULD** is a strong default; deviations require a documented reason.
- **MAY** is optional and requires a feature-level decision if implemented.
- **Priority:** Constitution > approved feature specifications > technical plans > implementation tasks > generated code and mockups.
- Assumptions, prototypes, AI suggestions, and illustrative data MUST NOT be mistaken for approved business requirements.
- An approved requirement whose implementation feasibility is unresolved remains a **requirement**, not a license to invent an insecure workaround. Its implementation MUST wait for the specified feasibility review.

## Project Context — Ratified Baseline

- **Product:** A multi-tenant charitable-organization management portal. This description is for internal project use, **not** a software-provider brand displayed to tenants.
- **First tenant:** جمعية إراك (ERAK), serving blind and visually impaired people. Its organization name/logo MUST NOT become the default for other tenants.
- **V1 users:** Internal staff, tenant administrators, and separate platform super administrators. Beneficiaries, donors, and volunteers are managed records, **not** V1 login accounts.
- **Planned business domains:** Beneficiaries, donors, volunteers, donations, accounts, reports, and settings. These names do not approve fields, business rules, workflows, or complete accounting behavior.
- **Deferred domain:** Services is post-MVP unless the project owner later amends scope.
- **Delivery:** Phased MVP: Core Foundation first; business modules follow individually approved specifications. The order of business modules is deliberately **not** fixed here.
- **Stack:** Next.js, TypeScript (strict), shadcn/ui, Tailwind CSS, Supabase PostgreSQL/Auth/Storage.
- **Repository:** pnpm + Turborepo monorepo. Mandatory `apps/portal`, `apps/admin`, and `packages/ui`.
- **Tenancy infrastructure:** One shared Supabase project/database for all tenants **within each environment**, with tenant isolation enforced by RLS and trusted server checks. Development and Production use **different** Supabase projects.
- **Authentication UX:** Username **or** email plus password, resolved within the tenant identified by its subdomain. Staff are invited by email.
- **Tenant routing:** Each organization has a unique, immutable subdomain. No custom domains in the MVP.
- **Language:** Arabic/RTL by default; English/LTR fully supported from V1.
- **Appearance:** System theme preference by default; user-selectable Dark, Light, or System, with the user's preference remembered.
- **Branding:** White-label per-tenant **organization name and optional logo**, but **one fixed platform Design System color palette**. Tenant-selected brand colors are not supported.
- **Navigation:** Consistent primary sidebar; secondary sidebar optional for each module.
- **Design references:** HTML mockups and screenshots are non-binding inspiration, not pixel-perfect targets or permission to invent features.

## Core Principles

### I. Shared Database, Strict Tenant Isolation

- All tenants within a given environment MUST share the approved Supabase project/database architecture. Separate Supabase projects **per tenant** are not the ratified design.
- Every tenant-owned record MUST be scoped to the owning tenant (`tenant_id` or a rigorously equivalent tenant ownership relation) and protected against cross-tenant read, write, relationships, export, and file access.
- PostgreSQL Row Level Security (RLS) MUST enforce tenant isolation for application-facing database access. Client-side filtering MUST NOT be relied upon as an authorization boundary.
- The server MUST verify tenant identity from the trusted host/subdomain mapping and MUST independently validate the authenticated staff account and authorized tenant context. A caller-provided `tenant_id`, route parameter, request body, or UI state MUST NOT prove access.
- Tenant-scoped foreign keys/relationships MUST prevent accidental links between records belonging to different tenants.
- Platform-owned shared metadata MUST be explicitly distinguished from tenant-owned records.
- Tests MUST include at least two tenants and negative cases for reads, writes, relationships, exports, storage access, and disabled tenants.
- A human MAY work for more than one organization, but MUST use a **separate tenant-scoped staff account and a DIFFERENT verified email address for each organization**. The same real email MUST NOT be registered to staff in multiple tenants. A shared staff login or cross-tenant switching MUST NOT be introduced. Independent usernames, passwords, roles, and sessions remain tenant-scoped.

**Rationale:** A shared infrastructure is economical, but an organization's data and staff identities must remain independent.

### II. Tenant Routing, Provisioning, Suspension, and Lifecycle

- The platform Super Admin alone MUST create a tenant in the dedicated admin application. Public tenant signup and tenant self-service registration are NOT part of the MVP.
- Creating a tenant MUST set its required organization display name, its unique subdomain, its activation state, and its first tenant administrator by email invitation. The tenant's logo MAY be supplied later.
- A tenant subdomain MUST be validated, globally unique within the platform, and **immutable after creation**, including for the Super Admin. Renaming the organization or replacing its logo MUST NOT change its subdomain.
- Tenant-specific subdomains (e.g. `erak.portal.example`) MUST identify the tenant before the login experience is rendered. Trust MUST be based on validated server-side hostname configuration and tenant lookup, not on an arbitrary user-supplied tenant ID.
- **Custom domains are out of MVP scope.** Tenant portals MUST use their platform-managed subdomains.
- For the MVP, platform tenant lifecycle MUST support **activation and suspension only**. Subscription plans, expiry dates, renewals, platform billing, payments, and subscription invoices are NOT MVP requirements.
- Suspension MUST prevent all staff access and data operations for that tenant, including requests coming from previously valid sessions; UI-only logout is insufficient. Tenant data MUST remain stored and isolated. Reactivation MUST restore use under the existing authorized accounts/roles, subject to normal authentication checks.
- The MVP MUST NOT offer irreversible tenant deletion. A future deletion/retention process requires a separate approved specification and constitutional amendment if necessary.
- Platform administrators MAY perform tenant/account administration when necessary, but that ability MUST NOT imply routine access to tenants' personal or financial records.

**Rationale:** Tenant onboarding and lifecycle are centrally controlled, predictable, and reversible for MVP operations.

### III. Authentication, Invitations, and Account Independence

- Supabase Auth MUST remain the authentication authority. Passwords MUST NOT be stored, checked, or logged in application-controlled tables or browser storage.
- Tenant portal sign-in MUST accept **username or email + password**; it MUST NOT demand an email-only login. Username resolution MUST happen through a reviewed and secure server-side method bound to the verified tenant subdomain.
- Usernames MUST be unique **within their tenant**, not globally. The same username MAY exist at another tenant.
- **Global staff email uniqueness (CL-048):** Each normalized, real verified email address MUST belong to at most ONE tenant's staff account across the entire platform, regardless of whether that account is active or disabled. An unexpired pending staff invitation also reserves its target email against invitations/registration in any other tenant; an expired unredeemed invitation without an activated account releases that reservation. The server MUST enforce this rule atomically at invitation and activation, without revealing which tenant owns a conflicting email. To work at multiple tenants, a person MUST have distinct verified email addresses and separate tenant-scoped staff identities. Email aliases used to evade this policy MUST NOT be generated by the application.
- Each email sign-in MUST resolve only to the authorized account of the active tenant; an email associated with another tenant MUST NOT authenticate into the current tenant. The Authentication Plan MUST specify consistent email normalization, Supabase Auth mapping, duplicate-invitation rejection without account enumeration, and concurrency-safe global uniqueness.
- **Former same-email feasibility gate retired (CL-048):** There is NO longer a requirement to support separate tenant staff accounts sharing one email, and the former architecture proof for that unsupported behavior is removed. Supabase Auth MUST remain authoritative. The Authentication Plan MUST still security-review and test tenant-bound username/email login, invitation verification, password recovery, global uniqueness, session revocation, and account-to-tenant authorization before Production. No cross-tenant identity reuse, generated email-alias workaround or insecure account lookup is permitted.
- Only tenant management users with authorization, or the platform Super Admin in permitted administrative workflows, MUST create staff invitations. A tenant manager MAY invite and administer staff in that tenant. Public staff self-registration is forbidden.
- Initial staff onboarding MUST start with an **email invitation**. The administrator selects the staff member's authorized initial role(s); the invited employee chooses their own available username and sets their password during secure activation.
- Password recovery MUST use a verified **email** channel, not SMS. Authorized tenant management and the Super Admin MAY initiate a secure administrative password reset. They MUST NOT see or choose a known current password, or gain access by silently impersonating the employee.
- Signup, invitation, recovery and administrative reset flows MUST use expiring, one-time, securely verified tokens/links and MUST avoid account enumeration and cross-tenant account confusion.
- 2FA/MFA enrollment and sign-in challenges (mandatory **or** optional) are **out of MVP scope** for staff, tenant managers, and platform Super Admins. This does not waive password protections, rate limiting, abuse detection, secure cookies, and session security. MFA may be specified for a later release.
- Credential material, Supabase service-role keys, admin privileges, and other secrets MUST NOT be sent to clients. Server authorization MUST use verified session identity, never a browser-supplied user ID.
- Demo logins and mock authentication MUST NOT be described or shipped as production security.

**Rationale:** Convenient username/email sign-in and email invitations must work without eroding tenant-account separation.

### IV. Session Security and Multiple Devices

- A staff member MUST be able to remain signed in across browser restarts. The product requirement is a rolling **30-day inactivity limit**, renewed by verified meaningful user activity, not by silent background refresh alone.
- There MUST NOT be automatic logout after short idle windows such as 30 or 60 minutes. A session with no qualifying user activity for 30 days MUST cease to authorize operations and require new sign-in.
- A staff account MAY have concurrent active sessions on multiple devices, with **no fixed device-count cap** in the MVP.
- Users MUST be able to view their active sessions and revoke individual other sessions or all other sessions through account settings, according to a security-reviewed session design.
- When a logged-in user changes their password, other sessions MUST be invalidated; the current session MAY be retained only if safely revalidated. When password recovery or an administrative reset occurs, **all older sessions** MUST be invalidated.
- Tenant suspension, account disablement, and administrative session revocation MUST block server/database access promptly even when a locally held token has not yet expired.
- The Authentication/Sessions Spec MUST verify that Supabase Auth's actual refresh-token, session, and sign-out behavior can enforce these application requirements; any required server-side revocation/idle state must be designed securely and tested. Do not claim that UI state or token expiry alone implements immediate revocation.

**Rationale:** Long-lived, multi-device sessions are a product choice, but must remain revocable and security-enforced.

### V. Tenant RBAC, Multiple Roles, and Record-Level Scope

- Platform Super Admin and tenant-manager privileges MUST be separate security concepts. Neither is a shortcut around tenant isolation.
- Each tenant MUST support custom roles composed of explicit permissions; a staff member MAY hold **multiple roles simultaneously**.
- Effective permissions MUST be the union of authorized grants from the member's assigned roles, subject to all enforced record scopes, tenant restrictions, and higher-priority security prohibitions. Absence of permission MUST deny access by default.
- Tenant managers MUST be able to manage roles and delegate appropriate role/permission management to staff through explicit authorization. A delegate MUST NOT grant permissions beyond their own authorized grant authority, modify protected platform privileges, or elevate their own access.
- Permission evaluation MUST cover server/database operations, not only navigation visibility or buttons. Applicable operations include create, view, update, archive/delete, restore, approve, export, and role/permission management.
- For supported modules and actions, permissions MUST support record-level data scope, including **All Records**, **Own Records**, and **Assigned Records** within the current tenant. The definitions of own/assigned, and the exact applicable actions, MUST be specified in each business module; no universal assignment field is presumed.
- Platform Super Admin MAY administer organizations, staff accounts, and authorized role-management workflows, but MUST NOT receive routine default access to beneficiary/donor personal data, private files, or tenant financial records. Any future exceptional support access requires a separate, least-privilege, time-bounded, auditable approval design.
- Privilege grants, removals, and role changes MUST be audited. Authorization-sensitive operations MUST be tested for escalation, role union, scoped records, and cross-tenant behavior.

**Rationale:** Flexible multi-role authorization must stay narrow enough to protect sensitive records.

### VI. Privacy, Deletion Policy, and Audit Logging

- Gather and reveal only data needed for approved use cases; beneficiary/disability information, donor contact details, private documents, and financial records are potentially sensitive.
- Sensitive input MUST be validated server-side. Data responses, exports, logs, and files MUST follow tenant and permission scope.
- Supabase Storage containing private records MUST use private access and tenant-aware, permission-checked file rules. Public file links MUST NOT be used for private records.
- **Deletion behavior depends on each module's approved rules.** Beneficiary and donor records SHOULD normally be archived (soft-deleted) with authorized restoration; financial transactions MUST use auditable cancellation/correction rather than silent overwrite or deletion; ephemeral records MAY permit permanent deletion according to an approved retention policy. No global hard-delete workflow is assumed.
- Audit events MUST include relevant administrative/security changes, staff and membership changes, grants/revocations, tenant lifecycle, sensitive settings, and business **create, update, archive, restore, and export** actions where applicable. Each business module MUST specify further auditable events.
- Routine **read/view-only access** to a beneficiary or donor record MUST NOT automatically be recorded as a dedicated business audit event in the MVP. Do not silently implement blanket read/search logging in every module. This does not prohibit necessary infrastructure/security access logs.
- Audit entries MUST record who acted, which tenant/context (where applicable), what action occurred, when, and enough safe identifiers to investigate; they MUST NOT include plaintext passwords, access tokens, secret keys, or unnecessary private payloads.
- Audit entries MUST be tamper-resistant; ordinary tenant users and tenant managers MUST NOT edit or manually delete audit history.
- `audit_logs.view` MUST be an explicit tenant-scoped permission. Tenant managers MAY delegate viewing to authorized roles, but the viewer MUST only see audit events their scoped permission allows. The platform Super Admin MUST have a **separate platform-administration audit log** and no automatic access to sensitive tenant audit contents.
- Audit retention MUST vary by event category and applicable obligations: financial events according to legal retention duties, security/account changes by an approved security retention period, operational events by appropriate business rules. Exact periods MUST be approved in a retention policy before release; tenant managers MUST NOT shorten mandatory durations or purge logs ad hoc.

**Rationale:** Audit what matters, preserve evidence, minimize sensitive data, and do not invent retention periods.

### VII. Fixed Stack, Monorepo, and Layer Boundaries

- The approved stack MUST be Next.js + strict TypeScript + Tailwind CSS + shadcn/ui + Supabase, organized in a **pnpm + Turborepo monorepo**.
- The repository MUST include at least:
  - `apps/portal` — independent, white-label tenant-facing portal;
  - `apps/admin` — separate platform Super Admin application;
  - `packages/ui` — authoritative shared shadcn/ui-based component and Design System package.
- Both apps MUST use the shared `packages/ui` package for common buttons, inputs, dialogs, tables, forms, navigation patterns, feedback, accessibility features, tokens, and other reusable presentational primitives. App-local copies of shadcn source MUST NOT form competing component libraries.
- UI component primitives MUST NOT embed tenant business workflows, Supabase credentials, direct domain database access, or authorization decisions. Domain-specific compositions MAY live in application/feature code but MUST use shared UI primitives.
- The admin app MUST have separate routing/deployment surface from the tenant portal; visual separation alone MUST NOT substitute for API, RLS, and authorization boundaries.
- Shared design tokens MUST centrally define the **fixed** color palette, typography, spacing, radii, contrast, focus, and directional behavior. Tenant-controlled color themes and per-tenant forks of UI components MUST NOT be implemented.
- Privileged data mutations and service-role operations MUST execute only in trusted server contexts. Service-role credentials MUST NEVER reach browser bundles.
- Database schema changes MUST use tracked migrations reviewed and tested before Production. Ad-hoc production database edits MUST NOT replace migrations.
- Shared foundations (auth, tenancy, permissions, localization, UI, settings) MUST be reused rather than repeatedly implemented per module. Avoid speculative frameworks and abstractions.
- Component exports, Tailwind compilation, TypeScript types, workspace dependency links, and builds MUST work across both applications.

**Rationale:** A consistent, maintainable shared UI and clearly separated security layers are central architectural constraints.

### VIII. Arabic-First Bilingual UX and Accessibility

- Arabic MUST be the default language with RTL direction. **English and LTR MUST be production-supported from V1**; do not defer English to post-MVP.
- Users MUST be able to switch their interface language. Navigation, form labels, errors, validation, dialogs, notifications, empty states, and authentication/admin experiences MUST be translated/localizable.
- Components MUST handle RTL/LTR with logical layout properties; usernames, emails, numbers, dates, and record IDs MUST remain readable. Switching interface language MUST NOT rewrite business data or record identifiers.
- Date, number, currency, and calendar formats MUST be deliberate and tested; a financial currency MUST NOT be inferred from UI language.
- Interactive UI MUST target **WCAG 2.2 AA**, including appropriate contrast, keyboard access, visible focus, screen-reader labels/feedback, reduced-motion support, and responsive layouts.
- The default appearance MUST follow the user's **system color-scheme preference**. Each staff member MUST be able to explicitly choose **Dark**, **Light**, or **System** and have that choice remembered for subsequent visits.
- Both themes MUST use the fixed shared Design System and support comfortable prolonged use; no harsh glows, unnecessary animation, or inaccessible low-contrast colors. Theme selection MUST be personal, not a tenant-wide brand-color override.
- Affected UI MUST be verified in Arabic/RTL and English/LTR, both themes, keyboard-only interaction, and responsive widths.

**Rationale:** Accessible Arabic-first design and complete bilingual operation are launch requirements, not decorative polish.

### IX. White-Label Tenant Identity with Fixed Colors

- Tenant-facing surfaces MUST show only the active tenant's authorized organization identity, not the software provider's brand, name, product name, trademark, or attribution.
- An organization **display name is mandatory** when the tenant is created. Its **logo is optional** and MAY be uploaded, replaced, or removed later.
- When no logo is configured, the UI MUST show a **neutral accessible icon** with the organization's display name. ERAK's logo or name MUST NOT be used as another tenant's fallback.
- Tenant **organization name and logo editing MUST be reserved to the tenant manager** (not delegated merely through a generic branding permission). The Super Admin MAY intervene for legitimate platform administration. Such changes MUST be authorized and audited.
- The color palette and primary color MUST be **fixed globally** through `packages/ui` and MUST NOT be selected, uploaded, or configured by a tenant. The final palette values are a Design System implementation concern under project-owner control.
- Once server-side tenant identity is resolved, the approved tenant name/logo MUST be reflected appropriately in login, navigation, headers, and branded content/metadata; system pages remain clear and functional without promotional copy.
- Logo upload MUST validate file type, size, and file validity server-side; tenant scope and private storage rules MUST protect logo management as appropriate. Exact constraints belong in the branding spec.
- Software-provider branding MUST NOT appear in tenant-facing login/logout, navigation, footers, loading/error screens, tab titles, favicons, installable metadata, notifications, invitation/recovery emails, reports, printouts, receipts, exports, or help text. No “Powered by” attribution is allowed.
- Branding in the independent Super Admin app MUST NOT leak into tenant-facing pages.

**Rationale:** Each portal represents its organization while sharing one accessible fixed design language.

### X. Modular Navigation and Design References

- The tenant portal MUST provide consistent primary navigation.
- The secondary sidebar MUST be **optional per module**. Modules with subdivisions MAY use it; direct-entry modules MUST use the available content width without an unnecessary empty sidebar.
- Visible items MUST reflect role permissions, but hiding an item MUST NOT substitute for enforcing authorization in the server/database.
- A global search bar, populated analytics dashboard, charts, KPIs, or invented business workflows are NOT Core Foundation requirements.
- HTML prototypes, screenshots, and exploratory mockups MUST remain non-binding visual and interaction references. Implementations MUST NOT copy them pixel-for-pixel or infer schemas, authentication, features, or security rules from them.
- Operational and authentication screens MUST use minimal, task-relevant text, never software-vendor marketing claims or decorative promotional slogans.

**Rationale:** Navigation should fit the approved work instead of defining unapproved work.

### XI. Configuration and Module Boundaries

- Tenant-specific option lists, categories, and business configuration MAY be made configurable when expressly required by an approved module specification; do not hardcode approved configurable lists permanently.
- Configuration MUST be tenant-scoped and localizable where displayed. Platform settings and tenant settings MUST have distinct owners and permissions.
- Tenant account administration, roles/permissions, profile/name/logo, locale, and theme preferences are Core Foundation concerns.
- A universal custom-field builder, generalized forms engine, and workflow engine are NOT approved by this constitution.
- Beneficiary, donor, volunteer, donation, account, and reporting workflows MUST each be discovered and approved in their own specifications.
- **Accounts and Donations MUST NOT be presumed to implement full double-entry accounting**; the financial scope and rules require separate approval.
- Services is deferred until a future explicitly approved phase. No services schema or workflow MUST be invented merely because the future domain has been named.

**Rationale:** Tenant flexibility should be deliberate, scoped, and justified by real business needs.

### XII. Phased MVP and Spec Kit Delivery Discipline

- The Core Foundation MUST be specified and delivered before dependent business module implementation.
- After Foundation, business modules MUST be developed incrementally; **their priority/order is deferred to the Implementation Roadmap**, not fixed constitutionally.
- Every non-trivial feature MUST have an approved feature spec covering purpose, actors, tenant context, in/out of scope, workflows, business rules, validation, authorization, edge/empty/error states, and measurable acceptance criteria.
- Technical plans MUST explain data ownership, schema/migration impact, tenant isolation, authentication and RBAC design, security tests, accessibility, and how the plan satisfies this constitution.
- The AI/developer MUST ask about material business unknowns; it MUST NOT invent field lists, donation approvals, account rules, dashboards, financial calculations, or workflow steps.
- Each feature MUST be broken into small testable tasks with traceability to accepted criteria. Scope expansion requires project-owner approval.
- Platform subscriptions in MVP mean **active/suspended tenant lifecycle only**; plans, subscription periods, payments, invoices, and renewal flows are deferred.

**Rationale:** Feature specifications prevent assumptions from becoming architecture or business policy.

### XIII. Deployment Environments, Migrations, and Backups

- Maintain exactly two approved persistent deployment environments initially: **Development** and **Production**. A standing Staging environment is NOT in initial scope.
- Development and Production MUST have **separate Supabase projects/databases/auth/storage configurations**, separate credentials, and independent environment variables. Inside each environment, tenants share that environment's own approved project.
- Production beneficiary/donor/private data MUST NOT be copied to Development for testing without separately approved privacy and sanitization controls. Prefer generated test data.
- Changes MUST pass documented tests and migration review before being deployed to Production, despite the absence of a Staging environment. Risky releases MUST include a rollback/recovery plan.
- Production MUST have **automated, regular database backups**, targeting at least daily recovery points, using supported Supabase plan features or another approved automated method. Required backup capability MUST be verified and provisioned before handling live data.
- Supabase Database backup MUST NOT be assumed to include **Storage file contents**. Production private files, images, documents, and tenant logos MUST have a separate secure, automated, restorable backup method where necessary to meet the approved backup policy; backup permissions and encryption MUST protect sensitive data.
- Backup retention duration, restore responsibilities, recovery objectives (RPO/RTO), backup-job checks, and testing frequency MUST be set in the Operations/Technical Plan before Production launch.
- Restores MUST be rehearsed periodically in a safe isolated context. Since all tenants share a Production database, a full-database restore may affect **all** tenants; operations MUST account for tenant-wide impact and avoid uncontrolled Production restores.
- An additional routine external-offsite backup and a fully expanded disaster-recovery platform are NOT mandatory in this initial choice, but MAY be introduced through approved planning if required for a viable recovery plan.

**Rationale:** Automated backups without verified file coverage and tested restoration are not sufficient protection.

### XIV. Quality Gates and Definition of Done

A feature is **not done** until all applicable checks pass:

1. Scope, specifications, acceptance criteria, and constitutional compliance are reviewed and approved.
2. TypeScript strict checks, lint, builds, and meaningful automated tests pass.
3. Authentication, permission-denial, role escalation, session revocation, and tenant-boundary tests cover relevant positive and negative cases.
4. RLS and private Storage behavior are tested for cross-tenant access; suspended tenants cannot operate using existing sessions.
5. Schema changes are migration-based and reproducible, with a reviewed Production rollout and recovery path.
6. Affected UI is tested in Arabic/RTL and English/LTR, Dark and Light themes, keyboard use, and relevant WCAG 2.2 AA criteria.
7. No sensitive data or privileged secrets leak via client bundles, logs, API responses, exports, or files.
8. Apps import shared presentational components from `packages/ui` rather than app-local shadcn source copies.
9. Tenant-facing output is white-label with tenant name/optional logo, fixed shared colors, and no provider attribution or ERAK branding leakage.
10. Approved invitations, login/recovery, session controls, and long-lived sessions meet their security acceptance criteria when in scope.
11. Audit actions and data retention follow the relevant approved policy; routine record reads are not silently added as business audit events.
12. Production launch is blocked without a tested database + required Storage backup/recovery process.
13. No unapproved feature, subscription billing workflow, custom domain, business dashboard, services module, or speculative domain schema has been added.
14. The result follows approved specs rather than copying reference design mockups literally.

## Explicitly Unresolved Implementation and Business Decisions

The reviewed requirements above are ratified; **these details remain open** and MUST be decided in feature specifications, technical plans, or a project-owner decision where required:

1. **Authentication design validation (former G-01 revised by CL-048):** Globally unique staff emails eliminate the requirement for a special same-email-across-tenants proof. The Authentication Plan MUST still verify Supabase Auth integration, tenant-bound username/email resolution, invitation verification, recovery, safe email normalization, session revocation, and non-enumeration before the affected implementation reaches Production.
2. Global staff email normalization and concurrency-safe account/invitation uniqueness, accepted username format, invitation expiration/resend, verified-email ownership, and recovery abuse protections.
3. Full permission catalog, grant-authority model, protected tenant-manager role, role union and the operational definition of All/Own/Assigned in each business module.
4. Session identity, server-enforced rolling 30-day inactivity, user-activity definition, device/session list, immediate account/tenant disable enforcement, reset-time session invalidation, and proven compatibility with actual Supabase mechanisms.
5. Exact organization-name constraints, logo upload limits, file lifecycle, favicon/metadata fallbacks, and fixed design token values selected by the project owner. **Tenant color customization is not open for reconsideration in a feature spec.**
6. Detailed staff, donor, beneficiary, volunteer, donation, reporting, and account domain schemas, financial controls, and workflows.
7. Per-module archive/restore/permanent-deletion rules; jurisdiction-specific data retention and compliance, including exact audit-log retention periods.
8. Audit-log events and scoping details, tamper-resistance implementation, operational infrastructure logs, and authorized support workflows.
9. Production hosting/domain provisioning for immutable subdomains, deployment and rollback mechanisms for two-environment operations.
10. Database and Supabase Storage backup automation, feature availability on the chosen Supabase plan, encryption, retention, restore drills, owner, RPO, and RTO.
11. Business-module sequencing after Core Foundation, to be decided in a separate implementation roadmap.

Do not interpret a listed unresolved **implementation detail** as permission to undo the ratified product decision above.

## Governance and Amendment Rules

- **Priority:** Constitution > approved specs > technical plans > tasks > code/reference designs.
- **Owner approval:** Changing any mandatory principle, MVP scope boundary, tenant architecture, or security constraint requires explicit project-owner approval with a documented rationale.
- **Versioning:** MAJOR for removal/redefinition of ratified safeguards or major contracts; MINOR for new mandatory principles or scope expansion; PATCH for clarifications with no behavioral change.
- **Exceptions:** Temporary exceptions MUST identify affected components, rationale, risk, approval, mitigation, and a removal date. Tenant isolation, password safety, and data-access safeguards MUST NOT be silently waived.
- **Review:** Specs, plans, code review, and releases MUST include a constitution-compliance check. Conflicts block acceptance until amended.
- **Ratification:** This version is ratified after project-owner review of the decisions documented below. Technical feasibility gates remain enforceable prerequisites to implementation.

## Constitution Amendment — CL-048 (2026-10-15)

**Owner-approved breaking change (1.0.0 → 2.0.0):** Supersedes the earlier requirement for a single real email to authenticate multiple independent tenant staff accounts. Staff emails are now globally unique across tenants, including occupied/pending identity reservations. This removes the former same-email feasibility stop-ship gate while retaining Supabase Auth authority, strict tenant isolation, username-or-email login, verified invitations, and normal security validation. All dependent feature specs, tests and plans MUST be updated before implementation.

## Review Decision Record — 2026-10-15

The following 38 agreed decisions are incorporated into the constitution. This index summarizes them; the normative provisions above control when more precision is needed.

| # | Ratified decision |
| --- | --- |
| 01 | Separate staff account for each tenant, even for the same person. |
| 02 | Tenant-specific subdomain determines the organization at sign-in. |
| 03 | Tenant manager and Super Admin can administer tenant employee accounts within authorized boundaries. |
| 04 | Username uniqueness is scoped to a tenant. |
| 05 | Password recovery is available both to the employee and through authorized administrative assistance. |
| 06 | Login accepts username **or** email, plus password. |
| 07 | First-time staff onboarding starts with an email invitation. |
| 08 | Self-service password recovery uses verified email only (not SMS). |
| 09 | **Amended by CL-048:** One verified staff email may be used in only ONE tenant across the platform; a person working for multiple tenants needs a different email for each. |
| 10 | Invited employees choose their own username and password. |
| 11 | Role/permission management can be delegated according to constrained permissions. |
| 12 | A staff account can hold multiple roles. |
| 13 | Data permissions support All / Own / Assigned record scopes where applicable. |
| 14 | Archive/correction/permanent-deletion rules depend on the business module. |
| 15 | Audit important mutations/security actions, not ordinary record viewing. |
| 16 | Audit visibility uses `audit_logs.view`; platform-admin logs are separate. |
| 17 | Audit retention periods depend on event type and obligations. |
| 18 | Tenant manager controls name/logo; primary palette is fixed platform-wide. |
| 19 | Tenant display name is required, logo optional, neutral logo fallback. |
| 20 | Arabic/RTL and English/LTR must both ship in V1. |
| 21 | Theme defaults to system preference with persisted Dark/Light/System user choice. |
| 22 | `apps/admin` is separate from `apps/portal`; both use `packages/ui`. |
| 23 | Only Super Admin creates tenants; first manager receives an invitation. |
| 24 | MVP subscriptions mean activation/suspension only, no plans/billing. |
| 25 | Suspended tenants lose operational access; data is preserved. |
| 26 | Permanent tenant deletion is not provided in MVP. |
| 27 | Tenant subdomains cannot be changed after creation. |
| 28 | No custom tenant domains in MVP. |
| 29 | No 2FA/MFA functionality in MVP. |
| 30 | Rolling 30-day inactivity-based login persistence. |
| 31 | Multiple simultaneous devices, no fixed cap; users can manage sessions. |
| 32 | Password changes revoke other sessions; recovery/admin reset revokes all older sessions. |
| 33 | Phased MVP, with Core Foundation first. |
| 34 | Business module implementation order is decided later. |
| 35 | pnpm + Turborepo monorepo. |
| 36 | Shared Supabase project/database per environment with tenant RLS isolation. |
| 37 | Development and Production only, with separate Supabase projects. |
| 38 | Automatic Production backup and verified recovery, including required Storage coverage. |

**Constitution Version:** 2.0.0 | **Ratified / Last Amended:** 2026-10-15