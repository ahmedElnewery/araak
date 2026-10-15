-- T082 operations-only functions (CL-041, CL-043): service_role only, no application route.
-- The `svc_ops_*` wrappers exist because `private` is not exposed through the API; they are not executable by clients.

create function private.bootstrap_platform_admin(p_auth_user_id uuid, p_operator_ref text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_all constant text[] := array['tenants.manage','tenants.managers.manage','tenants.staff.manage','platform_admins.invite','platform_audit.view'];
begin
  perform pg_advisory_xact_lock(hashtextextended('platform_bootstrap', 0));
  if exists (select 1 from private.platform_bootstrap_state) or exists (select 1 from public.platform_admins) then
    return false;
  end if;
  insert into public.platform_admins (auth_user_id, capabilities, created_via) values (p_auth_user_id, v_all, 'bootstrap');
  insert into private.platform_bootstrap_state (bootstrapped_at, operator_ref) values (now(), p_operator_ref);
  perform private.write_platform_audit(p_auth_user_id, p_operator_ref, 'platform_admin.bootstrapped',
    jsonb_build_object('authUserId', p_auth_user_id));
  return true;
end $$;

create function private.ops_revoke_platform_admin(
  p_auth_user_id uuid, p_operator_ref text, p_ticket_ref text, p_emergency boolean
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('platform_admins_ops', 0));
  if not exists (select 1 from public.platform_admins a where a.auth_user_id = p_auth_user_id and a.enabled) then
    return false;
  end if;
  if not coalesce(p_emergency, false) and not exists (
    select 1 from public.platform_admins a
    where a.enabled and a.auth_user_id <> p_auth_user_id and 'tenants.manage' = any (a.capabilities)) then
    raise exception 'last_platform_admin' using errcode = 'P0001';
  end if;
  update public.platform_admins set enabled = false where auth_user_id = p_auth_user_id;
  perform private.revoke_user_sessions(p_auth_user_id, null, 'platform_revoked');
  perform private.write_platform_audit(null, p_operator_ref, 'platform_admin.revoked_by_ops',
    jsonb_build_object('authUserId', p_auth_user_id, 'ticketRef', p_ticket_ref, 'emergency', coalesce(p_emergency, false)));
  return true;
end $$;

create function public.svc_ops_bootstrap_platform_admin(p_auth_user_id uuid, p_operator_ref text) returns boolean
language sql security invoker set search_path = ''
as $$ select private.bootstrap_platform_admin(p_auth_user_id, p_operator_ref) $$;
create function public.svc_ops_revoke_platform_admin(p_auth_user_id uuid, p_operator_ref text, p_ticket_ref text, p_emergency boolean) returns boolean
language sql security invoker set search_path = ''
as $$ select private.ops_revoke_platform_admin(p_auth_user_id, p_operator_ref, p_ticket_ref, p_emergency) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.bootstrap_platform_admin(uuid, text)', 'private.ops_revoke_platform_admin(uuid, text, text, boolean)',
    'public.svc_ops_bootstrap_platform_admin(uuid, text)', 'public.svc_ops_revoke_platform_admin(uuid, text, text, boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
