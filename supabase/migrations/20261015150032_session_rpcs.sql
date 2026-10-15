-- T128 session self-service RPCs (FR-018, FR-020, CL-036..CL-039).
-- Session ids exposed to the client are registry ids, never provider session ids or tokens. No IP/location data exists.

-- Own, live, unrevoked sessions of the caller (staff of the caller's tenant only).
create function public.list_my_sessions() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_current uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', sr.id, 'device_type', sr.device_type, 'browser', sr.browser, 'created_at', sr.created_at,
             'verified_activity_at', sr.verified_activity_at, 'is_current', sr.provider_session_id = v_current)
           order by (sr.provider_session_id = v_current) desc, sr.verified_activity_at desc)
    from public.session_registry sr
    where sr.auth_user_id = (select auth.uid())
      and sr.staff_id = (select private.current_staff_id())
      and sr.tenant_id = (select private.current_tenant_id())
      and sr.revoked_at is null
      and sr.verified_activity_at > now() - interval '30 days'), '[]'::jsonb);
end $$;

-- Revokes ONE other session of the caller. Current, foreign, stale and already-revoked ids all look the same.
create function public.revoke_my_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.tenant_staff := private.current_staff();
  v_current uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  v_provider uuid;
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select sr.provider_session_id into v_provider
    from public.session_registry sr
   where sr.id = p_session_id and sr.auth_user_id = (select auth.uid())
     and sr.staff_id = v_staff.id and sr.tenant_id = v_staff.tenant_id
     and sr.revoked_at is null and sr.verified_activity_at > now() - interval '30 days'
     and sr.provider_session_id <> v_current
   for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  perform private.revoke_sessions(array[v_provider], 'user');
  perform private.write_tenant_audit(v_staff.tenant_id, 'staff', v_staff.id, null, 'sessions', 'session.revoked',
    'session_registry', p_session_id::text, jsonb_build_object('scope', 'single'));
end $$;

-- Revokes every other session of the caller (registered or not), keeping the current one.
-- p_reason: 'user_all_others' (default, user-initiated) or 'password_change' (T132).
create function public.revoke_my_other_sessions(p_reason public.session_revoked_reason default 'user_all_others')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.tenant_staff := private.current_staff();
  v_current uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  v_n integer;
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_reason not in ('user_all_others', 'password_change') then raise exception 'not_authorized' using errcode = '42501'; end if;
  -- serialize concurrent bulk revocations of the same account
  perform 1 from public.session_registry where auth_user_id = v_staff.auth_user_id and revoked_at is null for update;
  v_n := private.revoke_user_sessions(v_staff.auth_user_id, v_current, p_reason);
  perform private.write_tenant_audit(v_staff.tenant_id, 'staff', v_staff.id, null, 'sessions', 'session.revoked',
    'tenant_staff', v_staff.id::text, jsonb_build_object('scope', 'others', 'reason', p_reason::text, 'revoked', v_n));
  return v_n;
end $$;

-- Meaningful-activity heartbeat (CL-036): renews only a live, authorized session, at most once per 60 s.
create function public.touch_session_activity() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  if not private.request_context_ok() then return false; end if;
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

revoke all on function public.list_my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
revoke all on function public.revoke_my_other_sessions(public.session_revoked_reason) from public, anon;
revoke all on function public.touch_session_activity() from public, anon;
grant execute on function public.list_my_sessions() to authenticated, service_role;
grant execute on function public.revoke_my_session(uuid) to authenticated, service_role;
grant execute on function public.revoke_my_other_sessions(public.session_revoked_reason) to authenticated, service_role;
grant execute on function public.touch_session_activity() to authenticated, service_role;
