-- T118 password recovery (FR-015, FR-021, CL-015..CL-019): 60 min links, newest-only, 300 s cooldown, 5 per rolling 24 h.

create table public.recovery_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_id uuid not null,
  origin text not null check (origin in ('self_service', 'manager_assisted', 'platform_assisted')),
  requested_by_staff_id uuid null,
  requested_by_platform_admin_id uuid null references public.platform_admins (auth_user_id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null,
  superseded_at timestamptz null,
  failed_at timestamptz null,
  constraint recovery_requests_staff_fk foreign key (tenant_id, staff_id) references public.tenant_staff (tenant_id, id),
  constraint recovery_requests_requester_fk foreign key (tenant_id, requested_by_staff_id) references public.tenant_staff (tenant_id, id),
  constraint recovery_requests_ttl_ck check (expires_at = issued_at + interval '60 minutes')
);
create index recovery_requests_staff_idx on public.recovery_requests (tenant_id, staff_id, issued_at desc);

-- A manager's (or platform admin's) own-password check, written by the service role only and consumed once within 120 s.
create table public.password_confirmations (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid not null,
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  constraint password_confirmations_ttl_ck check (expires_at = confirmed_at + interval '120 seconds')
);
create index password_confirmations_actor_idx on public.password_confirmations (actor_auth_user_id, confirmed_at desc);

do $$
declare t text;
begin
  foreach t in array array['recovery_requests', 'password_confirmations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('revoke delete, truncate on public.%I from service_role', t);
  end loop;
end $$;

-- Returns false for any denial (disabled account, cooldown, cap) with no side effects.
create function private.issue_recovery(
  p_staff_id uuid, p_origin text, p_actor_staff_id uuid, p_actor_platform_admin_id uuid, p_token_hash text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  s public.tenant_staff;
  v_now timestamptz := now();
  v_last timestamptz;
  v_count int;
begin
  select * into s from public.tenant_staff t where t.id = p_staff_id for update;   -- serializes issuance per account
  if not found or not s.enabled
     or not exists (select 1 from public.tenants t where t.id = s.tenant_id and t.state = 'active') then
    return false;
  end if;
  select max(r.issued_at), count(*) filter (where r.issued_at > v_now - interval '24 hours')
    into v_last, v_count from public.recovery_requests r where r.staff_id = s.id;
  if v_last is not null and v_now - v_last < interval '300 seconds' then return false; end if;
  if v_count >= 5 then return false; end if;
  update public.recovery_requests set superseded_at = v_now
   where staff_id = s.id and used_at is null and superseded_at is null and failed_at is null;
  insert into public.recovery_requests (tenant_id, staff_id, origin, requested_by_staff_id, requested_by_platform_admin_id,
                                        token_hash, issued_at, expires_at)
  values (s.tenant_id, s.id, p_origin, p_actor_staff_id, p_actor_platform_admin_id, p_token_hash, v_now, v_now + interval '60 minutes');
  perform private.write_tenant_audit(s.tenant_id,
    case when p_actor_staff_id is not null then 'staff' when p_actor_platform_admin_id is not null then 'platform_admin' else 'system' end,
    p_actor_staff_id, p_actor_platform_admin_id, 'staff', 'password.reset_initiated', 'tenant_staff', s.id::text,
    jsonb_build_object('origin', p_origin));
  return true;
exception when unique_violation then
  return false;
end $$;

-- Validates and marks the link used in one locked step. Null for every invalid case (neutral).
create function private.begin_recovery_redemption(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff uuid;
  s public.tenant_staff;
  r public.recovery_requests;
begin
  select q.staff_id into v_staff from public.recovery_requests q where q.token_hash = p_token_hash;
  if v_staff is null then return null; end if;
  select * into s from public.tenant_staff t where t.id = v_staff for update;   -- same lock order as issue_recovery
  select * into r from public.recovery_requests q where q.token_hash = p_token_hash for update;
  if r.used_at is not null or r.superseded_at is not null or r.failed_at is not null or now() >= r.expires_at
     or not s.enabled or not exists (select 1 from public.tenants t where t.id = s.tenant_id and t.state = 'active') then
    return null;
  end if;
  update public.recovery_requests set used_at = now() where id = r.id;
  return jsonb_build_object('requestId', r.id, 'authUserId', s.auth_user_id, 'tenantId', s.tenant_id,
                            'staffId', s.id, 'origin', r.origin);
end $$;

create function private.complete_recovery_redemption(p_request_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.recovery_requests; s public.tenant_staff;
begin
  select * into r from public.recovery_requests q where q.id = p_request_id and q.used_at is not null and q.failed_at is null;
  if not found then raise exception 'recovery_not_found' using errcode = 'P0001'; end if;
  select * into s from public.tenant_staff t where t.id = r.staff_id;
  perform private.revoke_user_sessions(s.auth_user_id, null,
    case when r.origin = 'self_service' then 'recovery' else 'admin_reset' end::public.session_revoked_reason);
  perform private.write_tenant_audit(s.tenant_id, 'staff', s.id, null, 'staff', 'password.reset_completed',
    'tenant_staff', s.id::text, jsonb_build_object('origin', r.origin));
end $$;

-- The password update failed after the link was spent: the link stays dead and the user requests a new one.
create function private.mark_recovery_failed(p_request_id uuid) returns void
language sql security definer set search_path = ''
as $$ update public.recovery_requests set failed_at = now() where id = p_request_id and failed_at is null $$;

create function public.request_manager_assisted_reset(p_target_staff_id uuid, p_token_hash text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_actor_staff uuid := (select private.current_staff_id());
  v_actor_user uuid := (select auth.uid());
  t public.tenant_staff;
  v_conf uuid;
begin
  if not private.is_active_tenant_manager() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into t from public.tenant_staff s where s.id = p_target_staff_id and s.tenant_id = v_tenant;
  if not found then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  if t.id = v_actor_staff then raise exception 'cannot_reset_self' using errcode = 'P0001'; end if;
  if not t.enabled then raise exception 'staff_not_eligible' using errcode = 'P0001'; end if;
  update public.password_confirmations pc set consumed_at = now()
   where pc.id = (select c.id from public.password_confirmations c
                  where c.actor_auth_user_id = v_actor_user and c.consumed_at is null and now() < c.expires_at
                  order by c.confirmed_at desc limit 1 for update skip locked)
  returning pc.id into v_conf;
  if v_conf is null then raise exception 'confirmation_required' using errcode = 'P0001'; end if;
  -- a denial raises, which also rolls back the consumption of the confirmation
  if not private.issue_recovery(t.id, 'manager_assisted', v_actor_staff, null, p_token_hash) then
    raise exception 'recovery_rate_limited' using errcode = 'P0001';
  end if;
  return t.email;
end $$;

-- Platform variant mirroring CL-015 (⛔ GATE-RBAC: owner to confirm). Requires tenants.staff.manage.
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

create function public.svc_issue_recovery(p_staff_id uuid, p_origin text, p_actor_staff_id uuid, p_actor_platform_admin_id uuid, p_token_hash text) returns boolean
language sql security invoker set search_path = ''
as $$ select private.issue_recovery(p_staff_id, p_origin, p_actor_staff_id, p_actor_platform_admin_id, p_token_hash) $$;
create function public.svc_begin_recovery_redemption(p_token_hash text) returns jsonb
language sql security invoker set search_path = ''
as $$ select private.begin_recovery_redemption(p_token_hash) $$;
create function public.svc_complete_recovery_redemption(p_request_id uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.complete_recovery_redemption(p_request_id) $$;
create function public.svc_mark_recovery_failed(p_request_id uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.mark_recovery_failed(p_request_id) $$;

grant insert, select on public.password_confirmations to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'private.issue_recovery(uuid, text, uuid, uuid, text)', 'private.begin_recovery_redemption(text)',
    'private.complete_recovery_redemption(uuid)', 'private.mark_recovery_failed(uuid)',
    'public.svc_issue_recovery(uuid, text, uuid, uuid, text)', 'public.svc_begin_recovery_redemption(text)',
    'public.svc_complete_recovery_redemption(uuid)', 'public.svc_mark_recovery_failed(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['request_manager_assisted_reset(uuid, text)', 'platform_request_staff_reset(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
