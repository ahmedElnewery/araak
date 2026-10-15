-- T110 / T120 support. The invitation role picker lists exactly the roles the actor may grant (the database ceiling is
-- authoritative); the own-password confirmation is stamped with the database clock so skew cannot extend its 120 s.

create function public.list_grantable_roles() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.request_context_ok() or not (private.has_permission('staff.invite') or private.is_active_tenant_manager()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name_normalized)
    from public.roles r
    where r.tenant_id = (select private.current_tenant_id()) and r.archived_at is null
      and private.actor_can_grant_role(r.id)), '[]'::jsonb);
end $$;
revoke all on function public.list_grantable_roles() from public, anon;
grant execute on function public.list_grantable_roles() to authenticated, service_role;

create function public.svc_record_password_confirmation(p_actor_auth_user_id uuid) returns void
language sql security invoker set search_path = ''
as $$
  insert into public.password_confirmations (actor_auth_user_id, confirmed_at, expires_at)
  values (p_actor_auth_user_id, now(), now() + interval '120 seconds')
$$;
revoke all on function public.svc_record_password_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.svc_record_password_confirmation(uuid) to service_role;
