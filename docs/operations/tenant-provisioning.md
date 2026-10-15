# Tenant provisioning

Organizations are created by a platform admin with the `tenants.manage` capability in the admin app (`/tenants/new`).

## DNS and TLS

A wildcard DNS record and a wildcard TLS certificate for the portal base domain cover every new subdomain, so provisioning needs **no** DNS or certificate change. Hostnames are in `docs/decisions/operations.md`. Locally, `*.portal.localhost` resolves to loopback.

Tenants live directly under the domain: `<subdomain>.<domain>` (`PORTAL_BASE_DOMAIN=<domain>`, no `portal.` level). The Araak organization uses the subdomain `portal` (`portal.<domain>`); create it first in Production. The admin app is `admin.<domain>` (`ADMIN_HOST`).

One-time setup when the domain is bought (Cloudflare Registrar keeps DNS at Cloudflare, so Vercel's nameservers cannot be used):

1. Cloudflare DNS: `CNAME *` → the target Vercel shows for the wildcard domain, **DNS only** (not proxied).
2. Cloudflare DNS: `NS _acme-challenge` → `ns1.vercel-dns.com` and `ns2.vercel-dns.com`, so Vercel can issue and renew the wildcard certificate.
3. Vercel: add `*.<domain>` to the portal project and `admin.<domain>` to the admin project.
4. Supabase (Production) Auth URL configuration: redirect URLs `https://*.<domain>/**` and `https://admin.<domain>/**`.

The wildcard covers one level only (`x.<domain>`, not `a.b.<domain>`); the host classifier rejects nested labels anyway. Platform DNS records (for example the mail provider's `send` records) must use reserved names, otherwise they would hide a tenant of that name.

## Subdomain rules

- 1 to 63 characters: lowercase `a-z`, digits and hyphens, not starting or ending with a hyphen.
- Not reserved: `admin`, `www`, `api`, `app`, `mail`, `smtp`, `auth`, `static`, `assets`, `status`, `support`, `araak`, `send`, `email`, `docs`, `help`, `blog`, `dev`, `staging`, `test`, `preview`, `cdn`, `id`, `login`, `account`, `dashboard`, `billing`. Tenants share one namespace with platform hosts, so a name the platform may need must be reserved before any tenant claims it (adding a reserved name later does not affect an existing tenant). `portal` is not reserved: it is the Araak organization's subdomain.
- Unique across the platform.
- **Immutable.** It is fixed at creation by a database trigger, and the admin app shows it read-only. If an organization needs another address, create a new organization; do not try to edit the old one.

## What creation does

One transaction creates the organization and issues the first-manager invitation (7 days, single use) for the given email. If the email is already used by any staff account, or reserved by another open invitation, the whole creation is rolled back with a neutral "email cannot be used" message. The invitation email shows only the organization name.

## Suspension and reactivation

Suspending an organization blocks all its staff immediately: the database denies every request, whatever session they hold. Data is kept. Reactivation restores access under the existing roles; individually disabled accounts stay disabled. Other organizations are unaffected.

## No deletion

There is no tenant deletion in the application or the database (no DELETE grant). Retiring an organization means suspending it.

## Managers

Only platform admins with `tenants.managers.manage` grant or revoke the protected manager authority. An organization must always keep at least one active manager, and demoting a manager ends all of that person's sessions at once. Open question for the owner (also in `docs/decisions/permission-catalog.md`): whether the last-manager rule should also apply while an organization is suspended. It currently does.
