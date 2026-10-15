-- Owner decision (2026-10-15): the Araak organization (أراك) is a permanent tenant at `portal.<domain>`;
-- `admin.<domain>` is the platform admin app and every other organization is `<label>.<domain>`. It is created here so
-- it exists in every environment from the first deploy, and no other tenant can ever take `portal`: subdomains are
-- unique and immutable, and tenants are never deleted. Idempotent: an existing `portal` tenant is kept as it is.
--
-- `portal` stays OUT of private.reserved_subdomains on purpose: the host classifier (packages/tenancy/src/host.ts)
-- rejects reserved labels, so reserving it would make portal.<domain> unreachable. Holding the label reserves it.
--
-- The display name can be changed in the admin app. The first manager is invited from the admin app (organization
-- page, Managers, Invite), like for any other organization.
do $$
declare v_id uuid;
begin
  insert into public.tenants (display_name, subdomain) values ('أراك', 'portal')
  on conflict (subdomain) do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.write_platform_audit(null, 'migration:20261015150040', 'tenant.created',
      jsonb_build_object('tenantId', v_id, 'subdomain', 'portal', 'state', 'active'));
    perform private.write_tenant_audit(v_id, 'system', null, null, 'tenant_settings', 'tenant.created',
      'tenant', v_id::text, jsonb_build_object('subdomain', 'portal', 'state', 'active'));
  end if;
end $$;
