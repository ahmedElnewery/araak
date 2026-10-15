-- T034 RLS helpers (STABLE SECURITY DEFINER, fixed search_path).
-- Active tenant managers implicitly hold every tenant-grantable permission with scope 'all' and every audit category
-- (docs/decisions/permission-catalog.md §2/§4). Manager-only authorities are checked with is_active_tenant_manager().

create function private.current_staff() returns public.tenant_staff
language sql stable security definer set search_path = ''
as $$ select s from public.tenant_staff s where s.auth_user_id = (select auth.uid()) $$;

create function private.current_staff_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select s.id from public.tenant_staff s where s.auth_user_id = (select auth.uid()) $$;

create function private.current_tenant_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select s.tenant_id from public.tenant_staff s where s.auth_user_id = (select auth.uid()) $$;

-- staff enabled, tenant active, registry session live (FR-006, FR-022)
create function private.request_context_ok() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_staff s
    join public.tenants t on t.id = s.tenant_id
    where s.auth_user_id = (select auth.uid())
      and s.enabled and t.state = 'active')
  and private.current_session_is_live()
$$;

create function private.is_active_tenant_manager() returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.request_context_ok() and exists (
    select 1 from public.tenant_manager_grants g
    join public.tenant_staff s on s.id = g.staff_id and s.tenant_id = g.tenant_id
    where s.auth_user_id = (select auth.uid()) and g.revoked_at is null)
$$;

create function private.my_role_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select sr.role_id
  from public.staff_roles sr
  join public.roles r on r.id = sr.role_id and r.archived_at is null
  where sr.staff_id = (select private.current_staff_id())
    and private.request_context_ok()
$$;

-- p_scope null: any scope; 'all': needs an 'all' grant; otherwise an 'all' or identical-scope grant.
create function private.has_permission(p_key text, p_scope public.record_scope default null) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.request_context_ok() and (
    (exists (select 1 from public.permission_catalog c where c.key = p_key and c.tenant_grantable)
       and private.is_active_tenant_manager())
    or exists (
      select 1
      from public.permission_grants pg
      where pg.role_id in (select private.my_role_ids())
        and pg.permission_key = p_key
        and (p_scope is null or pg.scope = 'all' or pg.scope = p_scope))
  )
$$;

create function private.audit_categories_for_actor() returns text[]
language sql stable security definer set search_path = ''
as $$
  select case
    when not private.request_context_ok() then '{}'::text[]
    when private.is_active_tenant_manager()
      then array['staff','invitations','roles','tenant_settings','sessions']
    else coalesce((
      select array_agg(distinct c)
      from public.permission_grants pg, unnest(pg.audit_categories) c
      where pg.role_id in (select private.my_role_ids()) and pg.permission_key = 'audit_logs.view'), '{}')
  end
$$;

-- enabled platform admin with a live platform session
create function private.platform_context_ok() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.auth_user_id = (select auth.uid()) and a.enabled)
     and exists (select 1 from public.session_registry sr
                 where sr.provider_session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
                   and sr.auth_user_id = (select auth.uid())
                   and sr.platform_admin_id = (select auth.uid())
                   and sr.revoked_at is null
                   and sr.verified_activity_at > now() - interval '30 days')
$$;

create function private.is_platform_admin(p_capability text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.platform_context_ok() and exists (
    select 1 from public.platform_admins a
    where a.auth_user_id = (select auth.uid()) and a.enabled and p_capability = any (a.capabilities))
$$;

-- serializes every role / membership / role-bearing invitation mutation in a tenant
create function private.rbac_lock(p_tenant_id uuid) returns void
language sql security definer set search_path = ''
as $$ select pg_advisory_xact_lock(hashtextextended('rbac:' || p_tenant_id::text, 0)) $$;

-- Grant ceiling (docs/decisions/permission-catalog.md §4). Authoritative; the TS version only drives UI hints.
create function private.actor_can_grant(p_key text, p_scope public.record_scope, p_audit_categories text[])
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare all_cats constant text[] := array['staff','invitations','roles','tenant_settings','sessions'];
begin
  if not private.request_context_ok() then return false; end if;
  if not exists (select 1 from public.permission_catalog c
                 where c.key = p_key and c.tenant_grantable and p_scope = any (c.supports_scopes)) then
    return false;
  end if;
  if p_key = 'audit_logs.view' then
    if p_audit_categories is null or cardinality(p_audit_categories) = 0
       or not (p_audit_categories <@ all_cats) then
      return false;
    end if;
  elsif p_audit_categories is not null then
    return false;
  end if;
  if private.is_active_tenant_manager() then return true; end if;
  if not exists (
    select 1 from public.permission_grants pg
    where pg.role_id in (select private.my_role_ids())
      and pg.permission_key = p_key and (pg.scope = 'all' or pg.scope = p_scope)) then
    return false;
  end if;
  if p_key = 'audit_logs.view' and not (p_audit_categories <@ (select private.audit_categories_for_actor())) then
    return false;
  end if;
  return true;
end $$;

create function private.actor_can_grant_role(p_role_id uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.request_context_ok() then return false; end if;
  if not exists (select 1 from public.roles r
                 where r.id = p_role_id and r.archived_at is null
                   and r.tenant_id = (select private.current_tenant_id())) then
    return false;
  end if;
  return not exists (
    select 1 from public.permission_grants pg
    where pg.role_id = p_role_id
      and not private.actor_can_grant(pg.permission_key, pg.scope, pg.audit_categories));
end $$;

do $$
declare f text;
begin
  -- allowlist: functions that RLS policy expressions call as the `authenticated` role
  foreach f in array array[
    'current_staff_id()', 'current_tenant_id()', 'request_context_ok()', 'my_role_ids()',
    'has_permission(text, public.record_scope)', 'is_active_tenant_manager()',
    'audit_categories_for_actor()', 'platform_context_ok()', 'is_platform_admin(text)'] loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated, service_role', f);
  end loop;
  -- not callable by clients; used by SECURITY DEFINER RPCs (which run as the owner) and tests
  foreach f in array array[
    'current_staff()', 'rbac_lock(uuid)', 'actor_can_grant(text, public.record_scope, text[])',
    'actor_can_grant_role(uuid)', 'sanitize_audit_metadata(jsonb)'] loop
    execute format('revoke all on function private.%s from public, anon, authenticated', f);
    execute format('grant execute on function private.%s to service_role', f);
  end loop;
end $$;
