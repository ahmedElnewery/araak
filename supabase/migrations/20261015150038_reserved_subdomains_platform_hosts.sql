-- Owner decision (2026-10-15): tenants live directly under the base domain (`<label>.<domain>`, no `portal.` level),
-- so tenant labels now share one namespace with platform hosts. The Araak organization takes the label `portal`
-- (`portal.<domain>`), so it is no longer reserved. Platform, mail-provider and environment labels are reserved before
-- any Production tenant can claim them (labels are immutable). Existing tenants are unaffected: the reserved check
-- runs on insert only. Keep packages/tenancy/src/reserved-subdomains.ts identical (tests/security/parity.test.ts).
delete from private.reserved_subdomains where name = 'portal';
insert into private.reserved_subdomains (name) values
  ('araak'), ('send'), ('email'), ('docs'), ('help'), ('blog'), ('dev'), ('staging'), ('test'), ('preview'),
  ('cdn'), ('id'), ('login'), ('account'), ('dashboard'), ('billing')
on conflict (name) do nothing;
