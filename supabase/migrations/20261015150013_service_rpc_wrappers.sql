-- Thin public wrappers so server-side code (service_role, supabase-js) can reach the private writers and
-- context loaders. `private` is not exposed through the API. Nothing here is executable by anon/authenticated.

create function public.svc_revoke_sessions(p_session_ids uuid[], p_reason public.session_revoked_reason)
returns int language sql security invoker set search_path = ''
as $$ select private.revoke_sessions(p_session_ids, p_reason) $$;

create function public.svc_write_tenant_audit(
  p_tenant_id uuid, p_actor_kind text, p_actor_staff_id uuid, p_actor_platform_admin_id uuid,
  p_category text, p_event text, p_resource_type text default null, p_resource_id text default null,
  p_metadata jsonb default '{}') returns bigint
language sql security invoker set search_path = ''
as $$ select private.write_tenant_audit(p_tenant_id, p_actor_kind, p_actor_staff_id, p_actor_platform_admin_id,
        p_category, p_event, p_resource_type, p_resource_id, p_metadata) $$;

create function public.svc_write_security_event(
  p_tenant_id uuid, p_actor_staff_id uuid, p_event text, p_metadata jsonb default '{}') returns bigint
language sql security invoker set search_path = ''
as $$ select private.write_security_event(p_tenant_id, p_actor_staff_id, p_event, p_metadata) $$;

create function public.svc_write_platform_audit(
  p_actor_platform_admin_id uuid, p_actor_operator_ref text, p_event text, p_metadata jsonb default '{}') returns bigint
language sql security invoker set search_path = ''
as $$ select private.write_platform_audit(p_actor_platform_admin_id, p_actor_operator_ref, p_event, p_metadata) $$;

-- One round trip for the server-side guard pipeline. The database clock decides liveness.
-- Returns null when the user has no tenant_staff row (incomplete or foreign identity = no access).
create function public.svc_load_staff_context(p_auth_user_id uuid, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'staffId', s.id, 'tenantId', s.tenant_id, 'username', s.username, 'email', s.email,
    'enabled', s.enabled, 'tenantState', t.state,
    'sessionLive', exists (
      select 1 from public.session_registry sr
      where sr.provider_session_id = p_session_id and sr.auth_user_id = p_auth_user_id
        and sr.staff_id = s.id and sr.revoked_at is null
        and sr.verified_activity_at > now() - interval '30 days'),
    'isManager', exists (
      select 1 from public.tenant_manager_grants g
      where g.staff_id = s.id and g.tenant_id = s.tenant_id and g.revoked_at is null))
  from public.tenant_staff s join public.tenants t on t.id = s.tenant_id
  where s.auth_user_id = p_auth_user_id
$$;

create function public.svc_load_platform_context(p_auth_user_id uuid, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'platformAdminId', a.auth_user_id, 'enabled', a.enabled, 'capabilities', to_jsonb(a.capabilities),
    'sessionLive', exists (
      select 1 from public.session_registry sr
      where sr.provider_session_id = p_session_id and sr.auth_user_id = p_auth_user_id
        and sr.platform_admin_id = a.auth_user_id and sr.revoked_at is null
        and sr.verified_activity_at > now() - interval '30 days'))
  from public.platform_admins a where a.auth_user_id = p_auth_user_id
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'svc_revoke_sessions(uuid[], public.session_revoked_reason)',
    'svc_write_tenant_audit(uuid, text, uuid, uuid, text, text, text, text, jsonb)',
    'svc_write_security_event(uuid, uuid, text, jsonb)',
    'svc_write_platform_audit(uuid, text, text, jsonb)',
    'svc_load_staff_context(uuid, uuid)',
    'svc_load_platform_context(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
