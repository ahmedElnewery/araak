-- Code-review fixes (2026-10-15). Each section names the defect it closes.

-- 1. set_my_preferences: both arguments optional. The app sends both, but an omitted key (supabase-js drops undefined
--    from the JSON body) must still resolve the function instead of failing with PGRST202.
create or replace function public.set_my_preferences(p_locale text default null, p_theme text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_staff public.tenant_staff := private.current_staff();
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_locale is not null and p_locale not in ('ar', 'en') then raise exception 'preference_invalid' using errcode = 'P0001'; end if;
  if p_theme is not null and p_theme not in ('system', 'light', 'dark') then raise exception 'preference_invalid' using errcode = 'P0001'; end if;
  if p_locale is null and p_theme is null then return; end if;
  insert into public.tenant_preferences (staff_id, tenant_id, locale, theme_mode)
  values (v_staff.id, v_staff.tenant_id, coalesce(p_locale, 'ar'), coalesce(p_theme, 'system'))
  on conflict (staff_id) do update
    set locale = coalesce(p_locale, public.tenant_preferences.locale),
        theme_mode = coalesce(p_theme, public.tenant_preferences.theme_mode),
        updated_at = now();
end $$;

-- 2. enable_staff: manager authority is platform-protected (CL-023). Disabling a manager keeps the manager grant, so
--    re-enabling a manager restores that authority: only an active manager may do it, never a staff.enable delegate
--    (the same rule disable_staff applies in the other direction).
create or replace function public.enable_staff(p_staff_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_actor uuid := (select private.current_staff_id());
  v_enabled boolean;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('staff.enable')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.tenants t where t.id = v_tenant for update;   -- serializes with disable_staff and manager demotion
  select s.enabled into v_enabled from public.tenant_staff s where s.id = p_staff_id and s.tenant_id = v_tenant for update;
  if not found then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  if v_enabled then return jsonb_build_object('ok', true); end if;   -- idempotent
  if exists (select 1 from public.tenant_manager_grants g
             where g.tenant_id = v_tenant and g.staff_id = p_staff_id and g.revoked_at is null)
     and not private.is_active_tenant_manager() then
    return private.rbac_deny(v_tenant, v_actor, 'staff', 'staff.enable_denied', 'manager_protected',
      'authz.privilege_escalation_denied', 'tenant_staff', p_staff_id::text);
  end if;
  update public.tenant_staff set enabled = true where id = p_staff_id;
  perform private.write_tenant_audit(v_tenant, 'staff', v_actor, null, 'staff', 'staff.enabled', 'tenant_staff', p_staff_id::text, '{}');
  return jsonb_build_object('ok', true);
end $$;

-- 3. touch_session_activity: platform-admin sessions are renewed too (FR-018: 30 days of INACTIVITY, not 30 days after
--    sign-in). Same rules: only the caller's own live, authorized session, at most once per 60 s.
create or replace function public.touch_session_activity() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  if not (private.request_context_ok() or private.platform_context_ok()) then return false; end if;
  update public.session_registry sr
     set verified_activity_at = now()
   where sr.provider_session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
     and sr.auth_user_id = (select auth.uid())
     and sr.revoked_at is null
     and sr.verified_activity_at > now() - interval '30 days'
     and sr.verified_activity_at < now() - interval '60 seconds';
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- 4. Email edges. The Auth user is created with the NORMALIZED address, so sign-in and recovery must use it too: the
--    stored display address only had spaces removed (btrim), and a trailing NBSP or similar edge character made the
--    account unusable. New invitations also store the display address without those edge characters.
create function private.trim_email(p_email text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select regexp_replace(p_email, '^[ \t\n\r\f\v   -     　﻿]+|[ \t\n\r\f\v   -     　﻿]+$', '', 'g')
$$;
revoke all on function private.trim_email(text) from public, anon, authenticated;
grant execute on function private.trim_email(text) to service_role;

create or replace function private.resolve_login_email(p_tenant_id uuid, p_identifier text) returns text
language sql stable security definer set search_path = ''
as $$
  select s.email_normalized
  from public.tenant_staff s join public.tenants t on t.id = s.tenant_id
  where s.tenant_id = p_tenant_id and s.enabled and t.state = 'active'
    and case when position('@' in coalesce(p_identifier, '')) > 0
             then s.email_normalized = private.normalize_email(p_identifier)
             else s.username_normalized = lower(btrim(p_identifier)) end
$$;

create or replace function private.assert_email_shape(p_email text) returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := private.trim_email(coalesce(p_email, ''));
begin
  if v !~ '^[^@\s]+@[^@\s]+$' or char_length(v) > 320 then
    raise exception 'email_invalid' using errcode = 'P0001';
  end if;
  return v;
end $$;

create or replace function private.issue_staff_invitation(
  p_tenant_id uuid, p_email text, p_role_ids uuid[], p_grants_manager boolean,
  p_actor_staff_id uuid, p_actor_platform_admin_id uuid, p_token_hash text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := private.trim_email(p_email);
  v_norm text := private.normalize_email(p_email);
  v_now timestamptz := now();
  v_role uuid;
begin
  -- No authorization here: callers (authorized RPCs) decide who may invite and which roles.
  perform private.rbac_lock(p_tenant_id);
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.state = 'active') then
    raise exception 'tenant_unavailable' using errcode = 'P0001';
  end if;
  insert into public.staff_invitations (id, tenant_id, recipient_email, recipient_email_normalized, grants_manager,
                                        invited_by_staff_id, invited_by_platform_admin_id)
  values (v_id, p_tenant_id, v_email, v_norm, p_grants_manager, p_actor_staff_id, p_actor_platform_admin_id);
  if not private.claim_email_reservation(p_tenant_id, v_norm, v_id, v_now + interval '168 hours') then
    raise exception 'email_unavailable' using errcode = 'P0001';   -- neutral: never says why or who
  end if;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    if not exists (select 1 from public.roles r where r.id = v_role and r.tenant_id = p_tenant_id and r.archived_at is null) then
      raise exception 'role_unavailable' using errcode = 'P0001';
    end if;
    insert into public.staff_invitation_roles (tenant_id, invitation_id, role_id) values (p_tenant_id, v_id, v_role);
  end loop;
  insert into public.staff_invitation_links (tenant_id, invitation_id, token_hash, kind, issued_at, expires_at)
  values (p_tenant_id, v_id, p_token_hash, 'initial', v_now, v_now + interval '168 hours');
  return v_id;
exception when unique_violation then
  -- an open invitation for this email already exists in this tenant (or the same token hash): neutral failure
  raise exception 'email_unavailable' using errcode = 'P0001';
end $$;

-- 5. One display-name rule everywhere (docs/decisions/branding.md §3). The platform create/rename paths only checked
--    for an empty name, so a name the manager's branding form rejects (over 80 characters, markup, control
--    characters) could be stored, and the manager could then not save branding without renaming the organization.
create or replace function public.platform_create_tenant(
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
  if not private.valid_tenant_display_name(v_name) then raise exception 'name_invalid' using errcode = 'P0001'; end if;
  if p_subdomain is null or p_subdomain !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'subdomain_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.reserved_subdomains r where r.name = p_subdomain) then
    raise exception 'subdomain_reserved' using errcode = 'P0001';
  end if;
  if private.trim_email(coalesce(p_manager_email, '')) !~ '^[^@\s]+@[^@\s]+$' then
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

create or replace function public.platform_update_tenant_name(p_tenant_id uuid, p_display_name text) returns void
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
  if not private.valid_tenant_display_name(v_name) then raise exception 'name_invalid' using errcode = 'P0001'; end if;
  -- the subdomain and id are never part of this statement (and are immutable by trigger)
  update public.tenants set display_name = v_name, updated_at = now() where id = p_tenant_id;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  perform private.write_platform_audit(v_actor, null, 'tenant.name_updated', jsonb_build_object('tenantId', p_tenant_id));
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'tenant_settings', 'tenant.name_updated',
    'tenant', p_tenant_id::text, '{}');
end $$;

-- 6. Platform admins whose only capability is managers or staff administration must be able to reach a tenant: the
--    tenant list and detail are metadata only (FR-029) and now open to any of the three tenant capabilities. Every
--    mutation still checks its own capability.
create function private.has_any_tenant_capability() returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_platform_admin('tenants.manage') or private.is_platform_admin('tenants.managers.manage')
      or private.is_platform_admin('tenants.staff.manage')
$$;
revoke all on function private.has_any_tenant_capability() from public, anon, authenticated;
grant execute on function private.has_any_tenant_capability() to service_role;

create or replace function public.platform_list_tenants()
returns table (id uuid, display_name text, subdomain text, state public.tenant_state, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_any_tenant_capability() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query select t.id, t.display_name, t.subdomain, t.state, t.created_at
    from public.tenants t order by t.created_at desc, t.id;
end $$;

create or replace function public.platform_get_tenant(p_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  if not private.has_any_tenant_capability() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select jsonb_build_object('id', t.id, 'display_name', t.display_name, 'subdomain', t.subdomain, 'state', t.state,
                            'created_at', t.created_at, 'updated_at', t.updated_at,
                            'has_logo', t.logo_object_path is not null, 'logo_version', t.logo_version)
    into r from public.tenants t where t.id = p_tenant_id;
  if r is null then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  return r;
end $$;

-- The staff of one tenant for the platform-assisted password reset (T121): account metadata only, `tenants.staff.manage`.
create function public.platform_list_tenant_staff(p_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin('tenants.staff.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('staffId', s.id, 'username', s.username, 'email', s.email, 'enabled', s.enabled,
             'isManager', exists (select 1 from public.tenant_manager_grants g
                                  where g.tenant_id = s.tenant_id and g.staff_id = s.id and g.revoked_at is null))
           order by s.username_normalized)
    from public.tenant_staff s where s.tenant_id = p_tenant_id), '[]'::jsonb);
end $$;
revoke all on function public.platform_list_tenant_staff(uuid) from public, anon;
grant execute on function public.platform_list_tenant_staff(uuid) to authenticated, service_role;

-- 7. Platform-admin sign-in throttling (docs/decisions/auth-abuse-controls.md: 5 per identifier and 20 per client IP in
--    15 minutes). Platform attempts use the nil UUID as their scope, so they never mix with any tenant's counters.
alter table private.auth_attempts drop constraint auth_attempts_kind_check;
alter table private.auth_attempts add constraint auth_attempts_kind_check
  check (kind in ('sign_in', 'recovery', 'platform_sign_in'));
alter table private.auth_abuse_limits drop constraint auth_abuse_limits_kind_check;
alter table private.auth_abuse_limits add constraint auth_abuse_limits_kind_check
  check (kind in ('sign_in', 'recovery', 'platform_sign_in'));
insert into private.auth_abuse_limits (kind, key_type, max_count, window_seconds) values
  ('platform_sign_in', 'identifier', 5, 900), ('platform_sign_in', 'ip', 20, 900);

create or replace function private.check_and_record_auth_attempt(
  p_tenant_id uuid, p_kind text, p_identifier_hmac text, p_client_ip_hmac text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare lim_id private.auth_abuse_limits; lim_ip private.auth_abuse_limits; n int;
begin
  select * into lim_id from private.auth_abuse_limits where kind = p_kind and key_type = 'identifier';
  select * into lim_ip from private.auth_abuse_limits where kind = p_kind and key_type = 'ip';
  if lim_id is null then raise exception 'unknown_kind' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auth:' || p_kind || ':' || p_tenant_id::text || ':' || p_identifier_hmac, 0));
  if p_client_ip_hmac is not null then
    perform pg_advisory_xact_lock(hashtextextended('authip:' || p_kind || ':' || p_tenant_id::text || ':' || p_client_ip_hmac, 0));
  end if;
  select count(*) into n from private.auth_attempts a
   where a.tenant_id = p_tenant_id and a.kind = p_kind and a.identifier_hmac = p_identifier_hmac
     and a.attempted_at > now() - make_interval(secs => lim_id.window_seconds)
     and (p_kind = 'recovery' or not a.succeeded);
  if n >= lim_id.max_count then return false; end if;
  if p_client_ip_hmac is not null then
    select count(*) into n from private.auth_attempts a
     where a.tenant_id = p_tenant_id and a.kind = p_kind and a.client_ip_hmac = p_client_ip_hmac
       and a.attempted_at > now() - make_interval(secs => lim_ip.window_seconds)
       and (p_kind = 'recovery' or not a.succeeded);
    if n >= lim_ip.max_count then return false; end if;
  end if;
  insert into private.auth_attempts (tenant_id, kind, identifier_hmac, client_ip_hmac)
  values (p_tenant_id, p_kind, p_identifier_hmac, p_client_ip_hmac);
  return true;
end $$;

-- 8. The actor's grant ceiling for MANY roles at once. staff_json, list_roles and list_grantable_roles called
--    actor_covers_role per row, and every call re-ran the whole context chain per grant
--    (O(staff x roles x grants) context queries). This evaluates the context once and checks every grant in one
--    set-based query. Same rule as private.actor_can_grant / actor_covers_role, which mutations keep using.
create function private.actor_covered_role_ids() returns setof uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  all_cats constant text[] := array['staff','invitations','roles','tenant_settings','sessions'];
  v_tenant uuid;
  v_manager boolean;
  v_cats text[];
begin
  if not private.request_context_ok() then return; end if;
  v_tenant := private.current_tenant_id();
  v_manager := private.is_active_tenant_manager();
  v_cats := private.audit_categories_for_actor();
  return query
    with mine as materialized (
      select pg.permission_key, pg.scope from public.permission_grants pg
      where not v_manager and pg.role_id in (select private.my_role_ids()))
    select r.id from public.roles r
    where r.tenant_id = v_tenant
      and not exists (
        select 1 from public.permission_grants pg
        join public.permission_catalog c on c.key = pg.permission_key
        where pg.role_id = r.id
          and not (
            c.tenant_grantable and pg.scope = any (c.supports_scopes)
            and case when pg.permission_key = 'audit_logs.view'
                     then pg.audit_categories is not null and cardinality(pg.audit_categories) > 0
                          and pg.audit_categories <@ all_cats
                     else pg.audit_categories is null end
            and (v_manager or (
              exists (select 1 from mine m where m.permission_key = pg.permission_key and (m.scope = 'all' or m.scope = pg.scope))
              and (pg.permission_key <> 'audit_logs.view' or pg.audit_categories <@ v_cats)))));
end $$;
revoke all on function private.actor_covered_role_ids() from public, anon, authenticated;
grant execute on function private.actor_covered_role_ids() to service_role;

create or replace function private.staff_json(p_tenant uuid, p_staff_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with covered as materialized (select private.actor_covered_role_ids() as id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'username', s.username, 'email', s.email, 'enabled', s.enabled, 'activatedAt', s.activated_at,
    'isManager', exists (select 1 from public.tenant_manager_grants g
                         where g.tenant_id = s.tenant_id and g.staff_id = s.id and g.revoked_at is null),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
                         'canGrant', exists (select 1 from covered c where c.id = r.id)) order by r.name_normalized)
                       from public.staff_roles sr join public.roles r on r.id = sr.role_id
                       where sr.staff_id = s.id), '[]'::jsonb)
  ) order by s.username_normalized), '[]'::jsonb)
  from public.tenant_staff s
  where s.tenant_id = p_tenant and (p_staff_id is null or s.id = p_staff_id)
$$;

create or replace function public.list_roles() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_tenant uuid := (select private.current_tenant_id()); v_staff uuid := (select private.current_staff_id());
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('roles.view')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    with covered as materialized (select private.actor_covered_role_ids() as id)
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'description', r.description, 'archivedAt', r.archived_at,
      'assignedCount', (select count(*) from public.staff_roles sr where sr.role_id = r.id),
      'heldByActor', exists (select 1 from public.staff_roles sr where sr.role_id = r.id and sr.staff_id = v_staff),
      'canGrant', exists (select 1 from covered c where c.id = r.id),
      'grants', coalesce((select jsonb_agg(jsonb_build_object('key', pg.permission_key, 'scope', pg.scope,
                  'auditCategories', pg.audit_categories) order by pg.permission_key)
                  from public.permission_grants pg where pg.role_id = r.id), '[]'::jsonb)
    ) order by (r.archived_at is not null), r.name_normalized)
    from public.roles r where r.tenant_id = v_tenant), '[]'::jsonb);
end $$;

create or replace function public.list_grantable_roles() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.request_context_ok()
     or not (private.has_permission('staff.invite') or private.has_permission('staff.roles.assign') or private.is_active_tenant_manager()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name_normalized)
    from public.roles r
    where r.tenant_id = (select private.current_tenant_id()) and r.archived_at is null
      and r.id in (select private.actor_covered_role_ids())), '[]'::jsonb);
end $$;
