-- T079 platform tenant RPCs (FR-002..FR-007, FR-029, FR-036).
-- Callable by `authenticated` only; the actor is always auth.uid() + the JWT session_id (is_platform_admin), never a parameter.

create function public.platform_create_tenant(
  p_display_name text, p_subdomain text, p_state public.tenant_state, p_manager_email text, p_token_hash text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_display_name, ''));
  v_state public.tenant_state := coalesce(p_state, 'active');
  v_id uuid;
begin
  if not private.is_platform_admin('tenants.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'name_required' using errcode = 'P0001'; end if;
  if p_subdomain is null or p_subdomain !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'subdomain_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.reserved_subdomains r where r.name = p_subdomain) then
    raise exception 'subdomain_reserved' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_manager_email), '') !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'email_invalid' using errcode = 'P0001';
  end if;
  begin
    insert into public.tenants (display_name, subdomain) values (v_name, p_subdomain) returning id into v_id;
  exception when unique_violation then
    raise exception 'subdomain_taken' using errcode = 'P0001';
  end;
  -- same transaction: an `email_unavailable` conflict rolls the whole creation back
  perform private.issue_staff_invitation(v_id, p_manager_email, '{}', true, null, v_actor, p_token_hash);
  if v_state = 'suspended' then
    update public.tenants set state = 'suspended', updated_at = now() where id = v_id;
  end if;
  perform private.write_platform_audit(v_actor, null, 'tenant.created',
    jsonb_build_object('tenantId', v_id, 'subdomain', p_subdomain, 'state', v_state));
  perform private.write_tenant_audit(v_id, 'platform_admin', null, v_actor, 'tenant_settings', 'tenant.created',
    'tenant', v_id::text, jsonb_build_object('subdomain', p_subdomain, 'state', v_state));
  return v_id;
end $$;

create function public.platform_set_tenant_state(p_tenant_id uuid, p_state public.tenant_state) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old public.tenant_state;
  v_event text;
begin
  if not private.is_platform_admin('tenants.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select t.state into v_old from public.tenants t where t.id = p_tenant_id for update;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  if p_state is null then raise exception 'state_invalid' using errcode = 'P0001'; end if;
  if v_old = p_state then return; end if;
  update public.tenants set state = p_state, updated_at = now() where id = p_tenant_id;
  v_event := case p_state when 'suspended' then 'tenant.suspended' else 'tenant.activated' end;
  perform private.write_platform_audit(v_actor, null, v_event, jsonb_build_object('tenantId', p_tenant_id));
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'tenant_settings', v_event,
    'tenant', p_tenant_id::text, '{}');
end $$;

create function public.platform_update_tenant_name(p_tenant_id uuid, p_display_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if not private.is_platform_admin('tenants.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'name_required' using errcode = 'P0001'; end if;
  -- the subdomain and id are never part of this statement (and are immutable by trigger)
  update public.tenants set display_name = v_name, updated_at = now() where id = p_tenant_id;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  perform private.write_platform_audit(v_actor, null, 'tenant.name_updated', jsonb_build_object('tenantId', p_tenant_id));
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'tenant_settings', 'tenant.name_updated',
    'tenant', p_tenant_id::text, '{}');
end $$;

-- Tenant metadata only: never tenant-private data (FR-029).
create function public.platform_list_tenants()
returns table (id uuid, display_name text, subdomain text, state public.tenant_state, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin('tenants.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query select t.id, t.display_name, t.subdomain, t.state, t.created_at
    from public.tenants t order by t.created_at desc, t.id;
end $$;

create function public.platform_get_tenant(p_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  if not private.is_platform_admin('tenants.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select jsonb_build_object('id', t.id, 'display_name', t.display_name, 'subdomain', t.subdomain, 'state', t.state,
                            'created_at', t.created_at, 'updated_at', t.updated_at)
    into r from public.tenants t where t.id = p_tenant_id;
  if r is null then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  return r;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'platform_create_tenant(text, text, public.tenant_state, text, text)',
    'platform_set_tenant_state(uuid, public.tenant_state)',
    'platform_update_tenant_name(uuid, text)',
    'platform_list_tenants()',
    'platform_get_tenant(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
