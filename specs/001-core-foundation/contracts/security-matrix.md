# Core Foundation — Authorization and Security Matrix

**Status:** Draft permission model; requires owner approval before permission IDs become production grants.

| Resource/action | Ordinary staff | Tenant role delegate | Tenant manager | Platform Super Admin | Platform ops |
| --- | --- | --- | --- | --- | --- |
| Tenant business/admin operation | explicit scoped grant only | explicit scoped grant | approved tenant authority | NO default private access | not default |
| Staff invitation | not default | if specifically granted and within grant ceiling | permitted | limited approved admin workflow | no default |
| Self role assignment/edit | NEVER | NEVER | NEVER | no tenant role bypass | not app workflow |
| Edit role assigned to actor | NEVER | NEVER | NEVER | no tenant role bypass | not app workflow |
| Role create/change | explicit grant only | within grant ceiling | within grant ceiling | no blanket tenant access | not default |
| Archive role with assignments | NEVER | NEVER | NEVER | NEVER | NEVER |
| Restore archived role | explicit restore grant + ceiling | explicit restore grant + ceiling | within grant authority | no blanket tenant data | not default |
| Appoint/revoke protected manager | NEVER | NEVER | NEVER | explicitly authorized only | restricted operations as defined |
| Change tenant name/logo | NEVER by generic permission | NEVER | YES | authorized intervention only | not default |
| Change tenant subdomain | NEVER | NEVER | NEVER | NEVER | NEVER |
| View tenant administrative audit | explicit category scoped audit_logs.view | explicit categories | permission/defined authority | no default tenant audit | no default |
| View tenant security log | NEVER | NEVER | active manager only | no default tenant log | per approved operations procedure only |
| View platform audit | NEVER | NEVER | NEVER | separate platform authorization | as authorized |
| Suspend/reactivate tenant | NEVER | NEVER | NEVER | authorized | via approved operations only |
| Invite platform admin | NEVER | NEVER | NEVER | requires platform_admins.invite | controlled bootstrap only |
| Remove platform admin via app | NEVER | NEVER | NEVER | NEVER | runbook ONLY, outside application |
| Restore production backup via app | NEVER | NEVER | NEVER | NEVER | runbook ONLY, outside application |

Always evaluate current tenant/account state, trusted host, authenticated identity, live session and permission record scope in server and in RLS-accessible paths. No UI visibility rule constitutes authorization. Platform administrator status is not automatically a tenant data-read role.

## Required denial tests
1. Tenant A attempting Tenant B SELECT/INSERT/UPDATE/DELETE/foreign-key references, export, Storage and audit access.
2. Disabled/suspended/revoked session use, even with previously valid signed token.
3. Global duplicated email invites: live pending, disabled staff, concurrency, expired unredeemed release.
4. Unauthorized protected manager appointment/removal; last activated active manager preservation and immediate demotion logout.
5. Self role changes, role definition edit by assigned editor, grant authority escape, concurrent role membership/permission modifications.
6. Archive assigned role, restore archived role without explicit authority or with conflicting active name.
7. Delegated audit reader attempts unrelated event categories, including totals/pagination/search/export.
8. Ordinary staff reading tenant Security Logs; Super Admin reading private tenant record/audit.
9. Invitation/recovery replay, expiry boundaries, issuance cooldown and rolling caps, session refresh/revoke races.
10. Secrets in logs, public file access bypass, malicious forwarded host and unknown subdomain.
