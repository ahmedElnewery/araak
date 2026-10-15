# Tenant provisioning

Organizations are created by a platform admin with the `tenants.manage` capability in the admin app (`/tenants/new`).

## DNS and TLS

A wildcard DNS record and a wildcard TLS certificate for the portal base domain cover every new subdomain, so provisioning needs **no** DNS or certificate change. Hostnames are in `docs/decisions/operations.md`. Locally, `*.portal.localhost` resolves to loopback.

## Subdomain rules

- 1 to 63 characters: lowercase `a-z`, digits and hyphens, not starting or ending with a hyphen.
- Not reserved: `admin`, `www`, `api`, `app`, `mail`, `smtp`, `auth`, `static`, `assets`, `portal`, `status`, `support`.
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
