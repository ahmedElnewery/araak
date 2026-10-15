-- Non-consuming validity check so the reset page can show a neutral "link unavailable" message before the form.
create function private.peek_recovery(p_token_hash text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('valid', true, 'tenantId', r.tenant_id)
    from public.recovery_requests r
    join public.tenant_staff s on s.id = r.staff_id
    join public.tenants t on t.id = r.tenant_id
    where r.token_hash = p_token_hash and r.used_at is null and r.superseded_at is null and r.failed_at is null
      and now() < r.expires_at and s.enabled and t.state = 'active'),
    jsonb_build_object('valid', false, 'tenantId', null))
$$;
create function public.svc_peek_recovery(p_token_hash text) returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.peek_recovery(p_token_hash) $$;
revoke all on function private.peek_recovery(text) from public, anon, authenticated;
revoke all on function public.svc_peek_recovery(text) from public, anon, authenticated;
grant execute on function private.peek_recovery(text) to service_role;
grant execute on function public.svc_peek_recovery(text) to service_role;
