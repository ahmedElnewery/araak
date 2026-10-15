-- Owner decision (supersedes 20261015150030): platform admins MAY request an assisted staff password reset.
-- Restores public.platform_request_staff_reset exactly as designed (CL-015 controls).

-- Platform variant mirroring CL-015 (GATE-RBAC closed: owner approved). Requires tenants.staff.manage.
create function public.platform_request_staff_reset(p_target_staff_id uuid, p_token_hash text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  t public.tenant_staff;
  v_conf uuid;
begin
  if not private.is_platform_admin('tenants.staff.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into t from public.tenant_staff s where s.id = p_target_staff_id;
  if not found then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  if not t.enabled then raise exception 'staff_not_eligible' using errcode = 'P0001'; end if;
  update public.password_confirmations pc set consumed_at = now()
   where pc.id = (select c.id from public.password_confirmations c
                  where c.actor_auth_user_id = v_actor and c.consumed_at is null and now() < c.expires_at
                  order by c.confirmed_at desc limit 1 for update skip locked)
  returning pc.id into v_conf;
  if v_conf is null then raise exception 'confirmation_required' using errcode = 'P0001'; end if;
  if not private.issue_recovery(t.id, 'platform_assisted', null, v_actor, p_token_hash) then
    raise exception 'recovery_rate_limited' using errcode = 'P0001';
  end if;
  return t.email;
end $$;

revoke all on function public.platform_request_staff_reset(uuid, text) from public, anon;
grant execute on function public.platform_request_staff_reset(uuid, text) to authenticated, service_role;
