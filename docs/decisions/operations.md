# Decision: Hosting, mail, secrets, backup and recovery

**Status: APPROVED by the project owner (2026-10-15)** (⛔ GATE-OPS). Blocks Production launch (US7); does not block Development work.
**Traces to:** FR-043–FR-045, CL-045–CL-047; research R-06, R-07.

Every row needs an owner-provided answer. "Proposal" is only a starting point.

| # | Topic | Proposal | Owner / operator decision |
| --- | --- | --- | --- |
| 1 | Portal base domain | A domain the organization controls; tenants are `<subdomain>.<base>` | **Owner: domain bought at Cloudflare** (tenant subdomains need an owned domain, not *.vercel.app) |
| 2 | Admin hostname | Distinct host that is not a tenant subdomain (e.g. `admin.<domain>`); `admin` is also a reserved subdomain | |
| 3 | Wildcard DNS/TLS | Wildcard record and certificate for `*.<base>`; proxy must overwrite, not append, `Host`/`X-Forwarded-Host`; set `TRUSTED_PROXY_HOPS` to the exact hop count | |
| 4 | Hosting for two deployments | Two separate Next.js deployments (portal, admin), separate env and secrets | **Owner: Vercel** |
| 5 | Mail transport | Authenticated SMTP or transactional provider with SPF/DKIM/DMARC; production mailer throws `MAIL_TRANSPORT_NOT_CONFIGURED` until chosen | **Owner: Resend** (adapter still to be written) |
| 6 | Secret manager | Platform secret store of the hosting provider; `SUPABASE_SECRET_KEY` and `AUTH_THROTTLE_HMAC_KEY` server-only; rotation procedure written | |
| 7 | Supabase plan and backup capability | Confirm the purchased plan offers daily backups with ≥30 days retention (PITR if available); record plan name and date verified | |
| 8 | Storage-bytes backup | Supabase DB backups do not contain Storage object bytes: scheduled export of `tenant-logos` and `tenant-private` to separate encrypted storage, 30-day rolling retention | |
| 9 | RPO / RTO | Proposal: RPO ≤ 24 h (≤ 1 h with PITR), RTO ≤ 8 h | |
| 10 | Responsible operators | Named primary and secondary operator; platform-ops-only restore authority; tenant-impact review before restore | |
| 11 | Restore rehearsal calendar | Isolated DB+Storage restore before launch and at least every 3 calendar months; each rehearsal is audited (`platform_audit_events`) | |
| 12 | Rollback | Schema deploys are backward compatible for one release; rollback plan per migration | |

## Approval

| | |
| --- | --- |
| Owner | ☑ Approved (2026-10-15) |
| Operator | ☑ Approved (2026-10-15); Production launch still needs the open rows resolved |
| Date / names | |

## Cost policy (owner, 2026-10-15)
Development on free tiers wherever possible; only Production is paid (estimate about 46 USD/month for one organization: Supabase Pro, Vercel Pro, Resend free tier, domain). Re-verify prices at purchase.
