# Feature Specification: Core Foundation

**Feature Branch:** 001-core-foundation  
**Created:** 2026-10-15  
**Status:** Draft — pending project-owner specification approval  
**Input:** Ratified Project Constitution v1.0.0 (2026-10-15), incorporating 38 project-owner decisions.

## Overview

Deliver the shared foundation for a white-label, multi-tenant charitable-organization management portal before any business-domain module is built. The foundation serves two distinct audiences: a platform Super Admin using a separate administration application, and staff/tenant managers operating inside their own organization's subdomain. It covers organization lifecycle, tenant-scoped identities and invitations, secure sessions, staff management, customizable multiple-role authorization, scoped permissions, audit history, tenant identity, Arabic/English accessibility, theme preferences, modular navigation, and safe production readiness.

**Governing rule:** The ratified constitution at .specify/memory/constitution.md takes precedence. This is a WHAT/WHY specification; detailed architecture, schemas, API contracts, data security mechanisms, UI designs, and deployment procedures belong to subsequent planning artifacts.

### In scope

- Separate platform-administration and tenant-staff experiences sharing one coherent component/design system.
- Platform-controlled organization creation, activation, suspension, initial tenant-manager invitation, and tenant directory.
- Immutable, unique, organization-specific subdomain as the tenant context; no tenant chooser for staff.
- Staff invitation, activation, sign-in using tenant-local username or email plus password, sign-out, verified-email password recovery, and authorized administrative reset.
- Independent staff accounts per tenant, even when the same human email is reused by another tenant.
- Long-lived, revocable, multi-device sessions and staff account activation/disablement.
- Tenant-scoped staff directory, role assignment, custom roles, multiple roles, delegated constrained role management, and permission checks.
- Foundation-level permission/record-scope semantics for All / Own / Assigned; no speculative business-record schema or assignment workflow.
- Audit trail of approved administrative and mutation events; scoped audit-log viewing.
- Tenant required display name, optional logo and neutral fallback; fixed shared colors with personal light/dark/system preference.
- Arabic/RTL and English/LTR experiences and permission-aware, modular application shell.
- Two separated deployment environments and documented release, backup and recovery readiness.

### Out of scope

- Beneficiary, donor, volunteer, donation, accounts/financial, reporting, and Services business records, screens and workflows; their exact order remains undecided.
- Subscription plans, expiry dates, pricing, renewal, billing, payment processing, and subscription invoices.
- Public registration for organizations or employees; beneficiary/donor/volunteer login accounts.
- Tenant deletion; tenant subdomain change; custom domains; tenant color selection.
- MFA/2FA, SMS recovery, tenant switching with a shared cross-tenant staff identity.
- Business dashboards, fabricated KPI widgets, global search, generic custom-field/workflow/form-builder systems, and promotional provider copy.
- Complete record ownership/assignment models or final export/approval semantics for future business modules.
- Production implementation, data model, technology design, or deployment itself: this artifact only specifies accepted behavior.

## User Scenarios & Testing (mandatory)

### User Story 1 — Platform Super Admin onboards and controls an organization (Priority: P1)

As the platform Super Admin, I need to create a tenant with an organization name, a unique subdomain, and a first tenant manager, then activate or suspend the tenant without exposing its protected records.

**Why this priority:** No other tenant-facing workflow can run before authorized tenant provisioning and trustworthy tenant resolution.

**Independent Test:** Create two organizations with distinct subdomains, send the initial manager invitation, suspend one, and verify no access to its operations while the other remains unaffected.

**Acceptance Scenarios:**

1. **Given** an authorized Super Admin, **when** they create an organization with a valid unused subdomain, name, and first manager email, **then** the platform records the tenant, resolves its independent portal, and initiates an authorized first-manager invitation.
2. **Given** a missing organization name, invalid subdomain, or already-used subdomain, **when** creation is attempted, **then** creation is rejected with a non-sensitive, actionable error.
3. **Given** an existing tenant, **when** its organization display name or logo changes, **then** its original subdomain remains unchanged and cannot be edited by either type of administrator.
4. **Given** a tenant with active staff sessions, **when** Super Admin suspends it, **then** further tenant-facing requests and data operations from those sessions are rejected while its data remains intact.
5. **Given** a suspended tenant, **when** Super Admin reactivates it, **then** appropriately authenticated and authorized staff can resume use under their existing roles.
6. **Given** two tenants, **when** the Super Admin manages one, **then** the action does not reveal the other tenant's private records or accidentally suspend it.

### User Story 2 — Invited employee activates an independent tenant account and signs in (Priority: P1)

As an invited staff member, I need to choose my own username and password, change my username securely from my own account settings, sign in from my organization's portal using username or email, and recover access using verified email.

**Why this priority:** Staff access is invitation-only and must not confuse two separate tenant accounts that share the same email.

**Independent Test:** Invite a person at each of two tenants using the same real email; demonstrate two separate username/password credentials and sessions, plus tenant-scoped login and recovery. **Blocked until authentication feasibility gate G-01 is passed.**

**Acceptance Scenarios:**

1. **Given** an authorized tenant manager or permitted Super Admin, **when** they invite a staff member by email and assign permitted initial roles, **then** the recipient receives a tenant-appropriate one-time invitation valid for seven days from issuance and no public registration route is offered.
2. **Given** a valid unexpired invitation for tenant A, **when** the invitee chooses an unused tenant-local username and password and completes verification, **then** a tenant-A account is activated with the approved roles.
3. **Given** an already-used username at tenant A, **when** an invitee chooses it, **then** the account cannot be activated with that username; use of the same username at tenant B remains permissible.
4. **Given** an active tenant-A account, **when** staff sign in on tenant A's subdomain with either their local username or email and correct password, **then** they enter tenant A only.
5. **Given** the same real email is invited to tenants A and B, **when** both accounts are activated, **then** they remain independently authorized, may have different usernames and passwords, and cannot log into the wrong tenant using the other tenant's password.
6. **Given** invalid credentials, an expired/reused invitation, unknown host, or a disabled account, **when** a user tries to authenticate, **then** access is refused without leaking another tenant's identity or revealing whether a private account exists.
7. **Given** a user who forgot the password, **when** they use verified-email recovery, **then** only the selected tenant account may be reset; an authorized administrator may initiate a reset without viewing an existing password or impersonating the user.
8. **Given** an email is already registered for one staff account in tenant A, **when** an administrator tries to invite a second account in tenant A with that email, **then** duplicate onboarding is rejected safely; the same email remains eligible for an independent account in tenant B.
9. **Given** an employee has a valid, active, tenant-scoped authenticated session, **when** they change their own username to an available name in Account Settings, **then** no password re-entry, email OTP, or additional verification step is required; only their tenant-local username changes, the same immutable account identity, roles and records remain intact, the change is audited, and future login accepts the new username.
10. **Given** the requested new username is already assigned to another staff account in the same tenant, **when** a change is attempted, **then** it is rejected without disclosing unnecessary account details; a matching username in another tenant does not block the change.
11. **Given** a tenant-bound invitation, **when** the invited person activates within seven days (168 hours) of issuance, **then** the invitation can be redeemed once if all security checks pass; **when** seven days have elapsed or the invitation was already redeemed, **then** it cannot activate an account and a safe expiry/reuse message is shown.
12. **Given** a pending invitation that was lost or expired, **when** an authorized tenant manager or permitted Super Admin selects Resend Invitation, **then** the system sends a replacement invitation to that same invited email with a fresh seven-day (168-hour) validity period; the previous invitation becomes unusable immediately, including when its original expiry has not yet been reached.
13. **Given** an unauthorized user, or the invitee acting without administrative permissions, **when** they attempt to resend an invitation, **then** the request is denied. No invitation reminder or self-service reissue action is offered in the MVP.
14. **Given** an invitee or existing employee is setting or changing a username, **when** they submit Arabic/non-Latin characters, numbers, spaces, hyphens, or any character outside ASCII letters (`A-Z`, `a-z`), underscore (`_`) and dot (`.`), **then** a localized validation error is shown. Names such as `ahmed`, `ahmed_ali`, and `ahmed.ali` pass the full character/placement and **3–30-character inclusive length** checks, subject to tenant uniqueness.
15. **Given** an invitee or existing employee chooses a username, **when** it has 2 or 31 characters, **then** it is rejected; **when** it has exactly 3 or 30 permitted characters, **then** it passes length validation, subject to all other approved username checks.
16. **Given** tenant A already has a staff username `Ahmed`, **when** another account tries to register or change its username to `ahmed` or `AHMED`, **then** the operation is rejected as a tenant-local duplicate. **When** the same account signs in using any of those capitalizations with its correct password, **then** the sign-in succeeds for that tenant. An identical username in a different tenant remains allowed.
17. **Given** a candidate username contains a number (e.g. `ahmed123`), **when** the staff member submits it during invitation activation or username change, **then** it is rejected; **given** names `ahmed_ali` and `ahmed.ali`, **when** checked against the approved full format, **then** both are valid subject to tenant uniqueness.
18. **Given** an invitee or employee submits `.ahmed`, `_ahmed`, `ahmed.`, `ahmed_`, `ahmed..ali`, `ahmed__ali`, or `ahmed._ali`, **when** the username is validated during activation or change, **then** the system rejects it with a localized explanation because a dot/underscore may only separate English-letter sequences.

### User Story 3 — Staff use long-lived, controllable sessions on multiple devices (Priority: P1)

As a staff member, I need to keep working across browser restarts and multiple devices, inspect and revoke my sessions, and have lost or compromised access invalidated promptly.

**Why this priority:** Rolling 30-day persistence and immediate revocation are explicit project-owner security and UX choices.

**Independent Test:** Open sessions on two devices, record meaningful activity, change and recover a password, revoke one session, and suspend the tenant; assert expected authorization behavior in every case.

**Acceptance Scenarios:**

1. **Given** a signed-in, active staff member, **when** they restart the browser before the 30-day inactivity period has elapsed, **then** the session remains usable subject to security checks.
2. **Given** a session with no verified meaningful user activity for 30 days, **when** any protected operation is attempted, **then** reauthentication is required, regardless of silent background token refreshes.
3. **Given** one account on multiple devices, **when** the user views active sessions and revokes a different one, **then** the revoked session can no longer perform protected operations while other valid sessions remain usable.
4. **Given** a successful password change during an active session, **when** other devices next request protected operations, **then** their prior sessions are denied; the current session remains only if safely revalidated.
5. **Given** email-based recovery or an administrative reset, **when** it completes, **then** all pre-reset sessions stop authorizing requests.
6. **Given** an account is disabled or its tenant is suspended, **when** any previously signed-in device makes a new protected request, **then** the request is rejected.

### User Story 4 — Tenant managers administer staff and constrained roles (Priority: P1)

As a tenant manager, I need to manage staff and reusable roles, assign multiple roles, and delegate narrow role-management authority without enabling privilege escalation or cross-tenant data access.

**Why this priority:** All later business modules must inherit centrally enforceable authorization.

**Independent Test:** Create two custom roles, assign both to one staff member, test union of allowed permissions, attempt self-elevation, attempt granting higher authority, and attempt cross-tenant operations.

**Acceptance Scenarios:**

1. **Given** an authorized tenant manager, **when** they invite, edit administrative attributes of, disable or re-enable a staff account, **then** only staff within that tenant are affected and the action is audited.
2. **Given** an authorized role manager, **when** they create or change a tenant-local role, **then** the role contains only permissions within their permitted grant authority.
3. **Given** a staff member with two roles, **when** they perform a permitted action, **then** effective grants are evaluated using both roles, while applicable restrictions still block disallowed records or actions.
4. **Given** a delegated role manager, **when** they try to grant a permission above their authority or elevate themselves, **then** the operation is denied and the attempted privileged action is handled under security-event logging rules.
5. **Given** a staff member without permission to view an audit log, **when** they access the URL or underlying operation directly, **then** the operation is denied even if navigation links are hidden.
6. **Given** record-scope rules (All, Own, Assigned), **when** an authorization test uses representative foundation fixtures in two tenants, **then** a grant cannot bypass tenant isolation or an applicable record scope. Actual record ownership semantics are defined by each future domain spec.

### User Story 5 — Staff work inside an accessible, white-label bilingual shell (Priority: P1)

As a staff member, I need to recognize my organization on the login and workspace screens, use Arabic or English, choose the most comfortable theme, and navigate only areas I am allowed to use.

**Why this priority:** Accessibility, tenant-only identity, and shared UI foundations are required before business screens can ship.

**Independent Test:** In two tenants with different names/logos, exercise login and shell in Arabic/RTL and English/LTR, Dark/Light themes, keyboard-only operation, and permissions that hide unauthorized navigation.

**Acceptance Scenarios:**

1. **Given** a valid tenant subdomain, **when** the login page is opened, **then** it presents that tenant's name and optional logo, or a neutral icon when no logo exists, without software-provider branding.
2. **Given** an authorized tenant manager, **when** they change the organization name or upload, replace, or remove its logo, **then** only that tenant's authorized identity changes; staff and delegated role managers without this specific authority cannot do so.
3. **Given** an employee who changes language, **when** the interface renders in Arabic or English, **then** translated UI uses correct RTL/LTR direction without altering identifiers or business records.
4. **Given** a user with theme set to System, **when** their device preference changes, **then** the UI follows it; with explicit Dark or Light selection, the selected preference persists across visits.
5. **Given** different tenant logos, **when** each tenant's portal renders, **then** the same fixed accessible colors are used, with no tenant color picker or default ERAK artwork for other tenants.
6. **Given** a module without nested sections, **when** staff open it, **then** the content uses the available width without an empty secondary sidebar; modules requiring subdivisions may show a secondary sidebar.
7. **Given** keyboard-only and screen-reader use, **when** the user traverses interactive shell and forms, **then** focus, labels, errors and contrast meet the approved accessibility standard.

### User Story 6 — Authorized staff review important administrative history (Priority: P1)

As a tenant manager or explicitly permitted auditor, I need to inspect administrative and important mutation history within my allowed tenant scope, while other users cannot alter or purge the evidence.

**Why this priority:** Role changes, suspensions, invitations and sensitive settings must be accountable from the beginning.

**Independent Test:** Perform administrative changes in two tenants and platform administration; confirm actor/time/scope/event coverage, authorized viewing, no cross-tenant visibility, and tamper protection.

**Acceptance Scenarios:**

1. **Given** staff/roles/membership, tenant-lifecycle, settings, or other in-scope important operations, **when** they are performed, **then** audit events include actor, action, time, tenant/context where applicable, and safe resource identifiers.
2. **Given** a user with explicit audit_logs.view authorization, **when** they review the log, **then** they see only events permitted for their tenant and audit visibility scope.
3. **Given** an ordinary staff member, **when** they attempt to edit or manually delete an audit event, **then** the operation is blocked.
4. **Given** the platform Super Admin, **when** they view platform administrative history, **then** it does not automatically disclose tenant-private audit contents.
5. **Given** a user merely opens a beneficiary/donor record in a future domain, **when** no significant action occurs, **then** the foundation does not automatically create a dedicated read-only business audit event.

### User Story 7 — Operators can release and recover the platform safely (Priority: P1; launch gate)

As the responsible operator, I need separate non-production and production environments, a reviewable rollout, regular recoverable database and file backups, and evidence that tenant isolation survives release changes.

**Why this priority:** A system holding personal and potentially financial information must not launch without verified recoverability.

**Independent Test:** Complete a documented non-production deployment/migration and a rehearsed restore in isolation, including required stored files, then demonstrate the release gate blocks production without evidence.

**Acceptance Scenarios:**

1. **Given** a pending production release, **when** mandatory tests, migration review or recovery evidence are missing, **then** the release is not accepted as ready.
2. **Given** separate Development and Production environments, **when** development activity or tests run, **then** they cannot operate on Production accounts, storage or private records.
3. **Given** a completed regular Production backup, **when** operators perform an approved isolated restore test, **then** the database and in-scope stored file contents can be recovered and verified.
4. **Given** a shared multi-tenant Production database, **when** restore is planned, **then** the plan explicitly considers impact on all tenants and does not silently replace the live database.
5. **Given** a tenant A test user, **when** they attempt tenant B reads, writes, references, exports, file access or suspended-tenant operations, **then** all prohibited cases are rejected.

### Edge Cases

- Unknown, malformed, reserved or duplicate subdomain; hostname spoofing and tenant-mismatched invitation links.
- One email associated with separate tenants and potentially multiple pending invitations; invitation reused, expired, already activated or resent; concurrent username reservation/activation.
- Invitation activation attempted immediately before or at/after the seven-day expiration boundary; the invitation stays non-redeemable after expiry even if a related email message is still available.
- Reissue requested just before activation, two reissues requested concurrently, or activation attempted using the original link after reissue; only the latest valid invitation can activate an account once, with tenant-scoped authorization and no duplicate staff identity.
- Simultaneous username changes to the same value, attempts to change another user's username, old-username sign-in after a change, and expired or revoked sessions attempting an update.
- Username attempts containing Arabic script, digits, whitespace, hyphens, visually similar non-ASCII letters, emoji or characters outside `[A-Za-z_.]`; the same character-set validation MUST apply during activation and username changes. The 3–30-character inclusive boundary MUST hold for initial selection and subsequent changes. Username uniqueness and sign-in MUST be case-insensitive within the tenant (e.g., `Ahmed` = `ahmed` = `AHMED`); simultaneous case-variant registrations/renames MUST not create duplicates. Punctuation cannot appear at the beginning or end, and consecutive or mixed adjacent punctuation is prohibited; dots and underscores may separate English-letter sequences only.
- Same verified email entered twice within one tenant: reject duplicate account/invitation safely; that same email may still be used by a different tenant.
- Tenant suspended during an active browser session, email recovery, or a pending invite; later reactivation without accidental privilege restoration to a disabled individual account.
- Two simultaneous role updates or a role removal while a staff member remains signed in; effective privileges must not persist improperly.
- Attempts to use a role's grant permission to modify itself or protected tenant-manager/platform authority.
- User has several roles with overlapping grants but stricter applicable scope; absence of permission continues to deny.
- Session revoked on one device while another refreshes its token; background refresh must not reset user inactivity without actual activity.
- Email account enumeration through tenant-scoped login/recovery, and credential stuffing/abuse.
- Missing logo, unsupported/corrupt/oversized logo, absent organization name, or accidental display of another organization's logo.
- Arabic-English mixed text and email/usernames in RTL screens, missing translations, inaccessible brand images, and theme preference before account activation.
- Audit viewer loses permission between page load and export; audit contents must not leak through stale client state.
- Interrupted backup, backup unavailable under the purchased service plan, backup containing private files without encryption, and failed restore rehearsal.

## Requirements (mandatory)

### Functional Requirements

**Tenant provisioning and administrative separation**

- **FR-001:** The platform MUST expose separate Super Admin and tenant staff experiences with independent authorization boundaries.
- **FR-002:** Only an authorized platform Super Admin MUST be able to create a tenant; public tenant signup MUST NOT exist.
- **FR-003:** Tenant creation MUST require an organization display name, a unique valid subdomain, an activation state, and an initial tenant-manager email invitation; logo MUST be optional.
- **FR-004:** Each tenant MUST be identified at sign-in by a trusted lookup of its subdomain; a caller-supplied tenant identifier MUST NOT establish its authorization context.
- **FR-005:** A tenant subdomain MUST remain immutable after tenant creation; custom domains MUST NOT be offered in the MVP.
- **FR-006:** The platform MUST support activation and suspension of tenants while preserving tenant records; suspension MUST deny new and existing-session protected operations.
- **FR-007:** Tenant deletion, subscription-plan configuration, expiry-based access and platform billing MUST NOT be offered in the MVP.

**Invitations and authentication**

- **FR-008:** Only appropriately authorized administrators MUST be able to invite, disable and manage tenant staff accounts.
- **FR-009:** Staff onboarding MUST begin with a one-time, tenant-bound verified-email invitation valid for **seven days (168 hours) from issuance**. A recipient MUST be able to set their own username and password only while the invitation is valid and unredeemed. At or after its expiry or after successful redemption, the invitation MUST no longer authorize account activation. **Only an authorized tenant manager or permitted Super Admin** MAY manually select **Resend Invitation** for a pending invite that was lost or expired; this MUST issue and send a replacement to the invitee's email with a fresh seven-day (168-hour) validity period and MUST immediately invalidate every previous invitation link for the same pending account, including unexpired links. Reissue MUST not produce duplicate staff accounts and MUST be tenant-scoped, concurrency-safe and appropriately audited. Self-service reissue by invitees and automatic reminder emails are NOT MVP requirements. The mechanism MUST be compatible with a security-reviewed Supabase Auth flow; default provider link lifetimes MUST NOT be presumed sufficient.
- **FR-010:** A staff username AND registered verified email MUST each be unique within its tenant, and MAY repeat in other tenants. Two staff accounts in the same tenant MUST NOT share a verified email. The **only permitted username characters** MUST be ASCII English letters (`A-Z`, `a-z`), underscore (`_`), and dot (`.`). Usernames MUST contain English letters; **digits (`0-9`)**, Arabic or other Unicode letters, whitespace, hyphens, and other punctuation MUST be rejected. This **supersedes the previous digits-and-underscore-only character rule (CL-006)**. Validate the new character set consistently during invitation activation and subsequent username changes. Username length MUST be **3–30 characters inclusive** for both account activation and subsequent changes. Username matching, uniqueness and login MUST be **case-insensitive within a tenant**: for example, `Ahmed`, `ahmed` and `AHMED` are the same username, and no two staff accounts in one tenant may claim case variants. This MUST be enforced server-side with concurrency-safe uniqueness, including during username changes. Whether entered capitalization is preserved for display is an implementation detail; it MUST NOT affect identity or authorization. Usernames MUST begin and end with English ASCII letters, and each dot (`.`) or underscore (`_`) MUST occur only between English-letter sequences; no leading, trailing, consecutive, or mixed-adjacent punctuation is valid. Together with the 3–30-character length limit, the accepted syntax is equivalent to `^[A-Za-z]+(?:[._][A-Za-z]+)*$` (illustrative expression, not a required implementation method).
- **FR-011:** Staff MUST be able to change their own tenant-local username from account settings with their existing, currently valid authenticated session, **without a separate identity-verification challenge** (password re-entry, email code, or reauthentication solely for this change). The server MUST check that the session is valid and the account belongs to the resolved tenant and the requesting employee; invalid, expired, revoked, cross-tenant, and other-account requests MUST be denied. The requested username MUST be available in the same tenant; changes MUST be validated server-side, concurrency-safe, and auditable. Immutable account identity, email, roles and records MUST NOT be replaced by a username change.
- **FR-012:** Tenant sign-in MUST accept either a tenant-local username or the registered email plus the account's password. Username lookup MUST be case-insensitive within the resolved tenant; the entered capitalization MUST NOT change which tenant account is authenticated.
- **FR-013:** The same real email MUST be supported by independent staff accounts in different tenants, without requiring shared passwords or cross-tenant identity switching. **Implementation blocked by G-01 until a security-reviewed working proof exists.**
- **FR-014:** Authentication and recovery MUST not reveal account existence or other tenant data through untrusted lookup, errors, logs or URLs.
- **FR-015:** Staff MUST be able to recover access through their verified email. Authorized administrators MUST be able to initiate a secure reset without knowing their existing password or impersonating them.
- **FR-016:** Staff self-registration, donor/beneficiary/volunteer sign-in, SMS recovery and MFA/2FA MUST NOT be introduced in this MVP.
- **FR-017:** Credentials, privileged secrets and raw passwords MUST NOT be exposed to the browser, logs, or application-owned credential tables.

**Sessions**

- **FR-018:** A valid session MUST survive browser restart and MUST expire after 30 days without verified meaningful user activity; background-only refresh MUST NOT count as activity.
- **FR-019:** A staff member MUST be allowed concurrent sessions across multiple devices without an MVP device-count cap.
- **FR-020:** A staff member MUST be able to view and revoke individual other sessions and revoke all other sessions from account settings.
- **FR-021:** Changing a password MUST invalidate other sessions, retaining the current session only if safely revalidated; recovery or admin reset MUST invalidate all pre-reset sessions.
- **FR-022:** Tenant suspension, employee disablement, and session revocation MUST be enforced on protected operations even if old browser tokens remain locally present.

**Roles, permissions, and record scope**

- **FR-023:** Each tenant MUST be able to create and manage its own roles and staff-role assignments; a staff account MUST support multiple simultaneous roles.
- **FR-024:** Effective grants MUST combine the grants of assigned roles without bypassing explicit record restrictions, tenant bounds, or higher-priority prohibitions.
- **FR-025:** Authorization MUST deny by default and MUST be checked for protected operations, not only screen or navigation visibility.
- **FR-026:** Tenant managers MAY delegate role administration to authorized staff, but delegates MUST NOT grant privileges beyond their authorized authority, self-elevate, or grant platform-administrator privileges.
- **FR-027:** The foundation MUST establish the permission vocabulary and extensibility for relevant create/view/update/archive/restore/export/approval and administrative actions without inventing domain-level business behavior.
- **FR-028:** The authorization foundation MUST support the All / Own / Assigned record scopes where domain specs call for them. Ownership, assignment and applicable operations MUST be defined by each future module.
- **FR-029:** The platform Super Admin MUST NOT gain default permission to inspect beneficiary/donor personal details, tenant files or financial data solely through platform administrative status.

**Audit and privacy**

- **FR-030:** The foundation MUST record important tenant lifecycle, account, membership, role, permission, sensitive settings and in-scope business mutation events with safe actor/action/time/context metadata.
- **FR-031:** Viewing tenant audit logs MUST require explicit tenant-scoped audit_logs.view permission and must enforce its applicable visibility scope; platform administrative logs MUST remain separate.
- **FR-032:** Ordinary staff/tenant managers MUST NOT be able to modify or manually erase audit records. No indiscriminate read-only business audit event stream MUST be imposed.
- **FR-033:** Audit event retention MUST follow an approved per-category retention policy established before production release; exact durations MUST NOT be invented in this spec.
- **FR-034:** Any tenant-private file access and exported records MUST remain tenant/permission scoped, including when a staff member owns or is assigned a record.

**White-label identity, language, and shell**

- **FR-035:** The portal MUST show only the active organization's required name and optional logo; without a logo, it MUST show a neutral accessible icon and the organization name.
- **FR-036:** Only the tenant manager (or authorized Super Admin intervention) MUST be able to modify a tenant's display name and logo; such changes MUST be validated and audited.
- **FR-037:** All tenants MUST use the same fixed, accessible color palette; tenant-selected colors and provider branding MUST NOT appear in tenant-facing surfaces, assets, notifications or document metadata.
- **FR-038:** Arabic/RTL MUST be the initial language/direction and English/LTR MUST be supported in the first release across all shipped experiences.
- **FR-039:** Employees MUST be able to choose Dark, Light or System theme; System MUST initially follow device preference, and user selections MUST persist.
- **FR-040:** The staff portal MUST provide permission-aware primary navigation and allow modules to omit a secondary sidebar. The foundation MUST NOT fill the shell with unapproved business dashboards or copy reference mockups literally.
- **FR-041:** Shipped interactive UI MUST meet WCAG 2.2 AA objectives, keyboard navigation, screen-reader feedback, responsive behavior, and clear mixed-direction content.
- **FR-042:** Common visual controls in both applications MUST follow the shared presentation system required by the constitution, with no tenant-specific copied component variants.

**Production readiness**

- **FR-043:** Development and Production MUST be isolated persistent environments. Tests MUST NOT access Production private data without separately approved controls.
- **FR-044:** Before Production handles live data, the platform MUST have verified regular automated database backups targeting at least daily recovery points and separate appropriate protection/restoration of required stored files.
- **FR-045:** Backup retention, recovery ownership/objectives, release rollback, audit retention, and restore rehearsal frequency MUST be documented and approved before Production launch.
- **FR-046:** Acceptance testing MUST include two tenants, positive and negative permission/security cases, cross-tenant access attempts, active-session suspension/revocation, and translation/theme/accessibility checks.

### Key Entities (conceptual; NOT a physical schema)

- **Tenant (organization):** Required display name, immutable subdomain, active/suspended state, optional logo, and administrative lifecycle.
- **Platform Administrator:** A privileged platform-level identity for creating/suspending tenants and permitted staff administration; distinct from tenant staff identities.
- **Tenant Staff Account:** An independently authenticated, tenant-specific employee identity with username, registered email, active/disabled status, and role memberships.
- **Invitation:** One-time, tenant/recipient/initiator/initial-role onboarding invitation with a seven-day (168-hour) validity period measured from issuance, a securely enforced lifecycle state, and administrator-triggered replacement that immediately invalidates the previous link.
- **Role:** A tenant-owned reusable collection of permission grants.
- **Permission Grant / Scope:** An allowed action within a protected area, possibly limited to All, Own, or Assigned records; domain meanings are separately defined.
- **Active Session:** A revocable authenticated device/browser session with a meaningful-activity boundary.
- **Tenant Branding:** Required organization display name and optional logo using a single shared fixed palette.
- **User Preference:** Interface locale and Dark/Light/System theme choice.
- **Audit Event:** Tamper-resistant actor, scope, action, time and safe reference to an administrative or approved mutation event.
- **Recovery Evidence:** Recorded result of protected database/file backup verification and restore rehearsal, including affected environment and date.

## Success Criteria (mandatory)

- **SC-001:** All tested cross-tenant attempts to view, mutate, reference or export protected data or private files fail for two distinct tenants; no successful cross-tenant unauthorized access.
- **SC-002:** 100% of protected tenant operations are denied when the tenant is suspended, including operations initiated by a session authenticated before suspension.
- **SC-003:** The invitation-to-activation and username/email login acceptance suite passes for two independent tenant accounts using the same real email; neither account can use the other's password. An unused invitation can activate before seven days (168 hours) from issuance but cannot activate at/after expiry or after redemption. An authorized manual reissue sends a fresh seven-day invite and immediately disables all previous links; unauthorized reissue, duplicate-account activation and self-service reissue are rejected. Self-service username changes require only a valid authenticated session with no additional password/email verification, are tenant-unique, preserve the original account identity/permissions, and reject conflicting names. Expired-session and unauthorized cross-account/tenant changes are rejected. Arabic/non-Latin characters, numbers, whitespace, hyphens and all other characters outside `[A-Za-z_.]` are rejected during username activation and change; English letters with dots or underscores pass the complete username format only if separators occur singly between English-letter sequences; leading/trailing/consecutive separators fail. Username lengths of exactly 3 and 30 pass the length check, while lengths of 2 and 31 fail; the same checks apply during activation and subsequent changes. Case variants of the same username cannot coexist within one tenant, and each valid account can sign in regardless of input capitalization.
- **SC-004:** Every defined session scenario passes: 30-day inactivity, browser restart, concurrent devices, individual revocation, password change, recovery/reset and staff disablement.
- **SC-005:** 100% of tested unauthorized role grants, self-escalation attempts and cross-tenant permission operations are refused; multi-role grants and record-scope fixtures produce the expected effective permissions.
- **SC-006:** All tested major administrative events appear in the correct tenant or platform log, without secrets, and no unauthenticated or unauthorized tenant user can read/modify the log.
- **SC-007:** Every released foundation screen is checked in both Arabic/RTL and English/LTR and Dark/Light themes; relevant keyboard-only and WCAG 2.2 AA checks pass.
- **SC-008:** Two tenants with different logos/names display the correct own organization identity; a tenant with no logo uses the neutral fallback; provider/other-tenant branding is absent.
- **SC-009:** Before Production activation, operators demonstrate a successful isolated database restore and recovery of required stored-file content from the approved automated backups.
- **SC-010:** No unapproved business module, tenant deletion, custom domain, payment/plan, MFA, color customization, dashboard or cross-tenant staff switching is present in the accepted foundation.

## Assumptions and Dependencies

- The ratified Constitution v1.0.0 is authoritative. Business-domain requirements will be specified separately.
- The first tenant is ERAK, but ERAK assets and workflows are not universal defaults.
- Employee records and future beneficiary/donor records are separate concepts; no public login is introduced for nonstaff.
- The actual hostname/base domain, logo constraints, permission identifiers, resend abuse/rate limits, cancellation of invitations for other reasons, recovery mail delivery service and retention durations are NOT determined by this document. Initial and reissued invitations each have an approved seven-day validity period, and administrator-triggered reissue invalidates old links immediately. Secure Supabase-compatible enforcement remains a technical planning/proof obligation.
- The approved stack, shared UI package, per-environment shared Supabase project, separate applications, and monorepo tooling are fixed by the constitution; their specific implementation belongs to the technical plan.
- User-facing visual design may differ substantially from any reference HTML as long as approved experience and accessibility requirements are met.
- Production cannot be declared ready based only on this document or a successful UI demonstration.

## Clarification Record

- **2026-10-15 — CL-001 (approved by project owner):** Within a single tenant, every staff account must use a different verified email; duplicate email accounts are not permitted. The same real verified email can still be used by independent accounts in different tenants. This resolves only the within-tenant email uniqueness part of G-02, not the G-01 technical feasibility gate.
- **2026-10-15 — CL-002 (historical; extra identity-verification requirement superseded by CL-011):** Staff may change their own username through Account Settings provided the replacement is unused within their tenant; account identity and required audit stay unchanged. The previous additional identity-verification condition no longer applies (see CL-011).
- **2026-10-15 — CL-003 (approved by project owner):** Staff invitation validity is **seven days (168 hours) from issuance**. Invitations remain single-use; redemption after expiry is rejected. Safe enforcement with Supabase Auth must be demonstrated during technical planning.
- **2026-10-15 — CL-004 (approved by project owner):** Only an authorized tenant manager or permitted Super Admin may manually resend a lost or expired staff invitation. Every resend issues a fresh seven-day (168-hour) single-use invitation and immediately invalidates prior invitation links. Invitee self-service resend and automatic reminder emails are out of MVP scope. Security controls and safe provider-compatible enforcement remain for technical planning.
- **2026-10-15 — CL-005 (historical, partly superseded by CL-009):** Staff usernames use English/ASCII Latin letters only for alphabetic characters (not Arabic or other scripts) and may not include spaces. Digits were previously tentatively permitted, but CL-009 explicitly forbids them; staff display names may still be Arabic.
- **2026-10-15 — CL-006 (superseded by CL-009):** Earlier character set of ASCII English letters, digits and underscore only; this rule is no longer active. CL-009 disallows digits and permits dots. Length and case-insensitive matching remain governed by CL-007 and CL-008.
- **2026-10-15 — CL-007 (latest project-owner choice B supersedes earlier uncommitted choice C):** Staff usernames MUST be between **3 and 30 characters inclusive**, measured against the approved ASCII-only character set. Enforce the limits for both invitation activation and later username changes. This supersedes the previously expressed 5–32-character preference; that earlier preference was not incorporated in this spec. Case sensitivity was later resolved by CL-008; leading/trailing character rules remain undecided.
- **2026-10-15 — CL-008 (approved by project owner):** Username matching MUST be case-insensitive within a tenant for registration, changes, uniqueness checks and login. `Ahmed`, `ahmed`, and `AHMED` identify the same tenant-local username, but the same username may exist in another tenant. The database/server implementation MUST prevent concurrent case-variant duplicates; choice of display capitalization is not a new identity.
- **2026-10-15 — CL-009 (approved by project owner; overrides CL-006):** Employee usernames use **English ASCII letters and optional underscore (`_`) or dot (`.`), with NO digits**. They must contain English letters. Hyphens, whitespace, Arabic and all other characters are forbidden. The previously approved length (3–30 inclusive) and case-insensitive tenant-local matching remain unchanged. Punctuation placement was subsequently clarified in CL-010.
- **2026-10-15 — CL-010 (approved by project owner):** Username MUST start and end with an English ASCII letter. Dot and underscore are permitted only as single separators between English-letter sequences; leading, trailing, adjacent or repeated punctuation is forbidden. Apply this to invitation activation and username changes, alongside 3–30 length (CL-007), case-insensitive tenant matching (CL-008), and the letters/dot/underscore-only rule (CL-009).
- **2026-10-15 — CL-011 (approved by project owner; supersedes CL-002 re-verification):** An employee who is already signed in through a valid authenticated session may change their own username directly in Account Settings without password re-entry, email OTP, or any additional identity challenge. Session validity, server-side own-account authorization, tenant isolation, username uniqueness/validation, and audit logging remain mandatory. This decision does not relax email-change, password-reset, or other sensitive-action rules.

## Blocking Gates and Decisions to Resolve

**G-01 — Authentication feasibility (CRITICAL; before production auth implementation):** Demonstrate a security-reviewed, Supabase-Auth-authoritative approach that provides *independent accounts with the same real email* across tenants in a shared Auth project. The working proof MUST cover both tenant-local username and email login, invitations, email verification, password recovery, distinct credentials, independent sessions, account revocation and avoidance of account enumeration. **[NEEDS CLARIFICATION: If no secure feasible design is established, the project owner must approve an explicit constitutional/architecture decision before this requirement changes.]**

**G-02 — Staff identity and account lifecycle policy (before final auth UX/contracts):** **Resolved decision:** a verified email is unique to one staff account within a tenant but MAY be reused in other tenants. **Still open:** optional display-capitalization handling only (username rules resolved in CL-007 through CL-010), no additional verification for username changes (CL-011), invitation resend abuse limits and cancellation for reasons other than reissue, email change/verification, recovery abuse limits, and administrative reset behavior. **Seven-day invitation expiry and administration-only manual reissue invalidating previous links are approved (CL-003/CL-004), subject to secure implementation feasibility in the Authentication Plan.** **[NEEDS CLARIFICATION: What are the remaining username-validation and invitation/recovery lifecycle rules?]**

**G-03 — Authorization and operations contract (before technical planning/production launch as applicable):** Approve the permission catalog and protected manager/grant-authority safeguards, audit-log viewing scope and retention policy, definition of meaningful session activity, session-list/revocation behavior, platform-admin provisioning, branding upload limitations, backup coverage/retention, and recovery responsibility. **[NEEDS CLARIFICATION: Which permissions are grantable by tenant managers/delegates, and how is protected tenant-manager authority governed?]**

G-01 is a **stop-ship feasibility gate**, not an optional product change. G-02/G-03 unresolved details MUST be decided through the relevant Foundation subspecs, clarification, or technical/operations plans before the affected work starts.

## Constitution Compliance Notes

- **Aligned:** One shared database per environment with tenant isolation; staff accounts independent across tenants; fixed tenant branding colors; Arabic+English; System theme default; two apps with shared UI; activation/suspension rather than billing; phased MVP; automated backup plus Storage recovery.
- **Security-sensitive implementation deferred:** exact identity mapping, session enforcement, RLS, role grant safeguards, storage authorization, subdomain resolution, migration/backup procedures and infrastructure configuration.
- **No silent scope expansion:** This spec does not authorize speculative business records, screens, workflows, financial behaviors, or provider-branded marketing content.
