-- Revoke every provider session of a user (registered or not), optionally keeping one. Used for disable,
-- demotion, password change and recovery: sessions that never reached the registry must not survive either.

create function private.revoke_user_sessions(
  p_auth_user_id uuid, p_except_session_id uuid, p_reason public.session_revoked_reason
) returns int
language plpgsql security definer set search_path = ''
as $$
declare ids uuid[];
begin
  select coalesce(array_agg(x.id), '{}') into ids from (
    select sr.provider_session_id as id from public.session_registry sr
      where sr.auth_user_id = p_auth_user_id and sr.revoked_at is null
    union
    select s.id from auth.sessions s where s.user_id = p_auth_user_id
  ) x
  where p_except_session_id is null or x.id <> p_except_session_id;
  return private.revoke_sessions(ids, p_reason);
end $$;
revoke all on function private.revoke_user_sessions(uuid, uuid, public.session_revoked_reason) from public, anon, authenticated;
grant execute on function private.revoke_user_sessions(uuid, uuid, public.session_revoked_reason) to service_role;

create function public.svc_revoke_user_sessions(
  p_auth_user_id uuid, p_except_session_id uuid, p_reason public.session_revoked_reason) returns int
language sql security invoker set search_path = ''
as $$ select private.revoke_user_sessions(p_auth_user_id, p_except_session_id, p_reason) $$;
revoke all on function public.svc_revoke_user_sessions(uuid, uuid, public.session_revoked_reason) from public, anon, authenticated;
grant execute on function public.svc_revoke_user_sessions(uuid, uuid, public.session_revoked_reason) to service_role;
