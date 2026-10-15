-- T032 session registry. Method proven in R-03: revoke = mark registry row AND delete auth.sessions row.

create table public.session_registry (
  id uuid primary key default gen_random_uuid(),
  provider_session_id uuid not null unique,
  auth_user_id uuid not null,
  tenant_id uuid null,
  staff_id uuid null,
  platform_admin_id uuid null references public.platform_admins (auth_user_id),
  created_at timestamptz not null default now(),
  verified_activity_at timestamptz not null,
  revoked_at timestamptz null,
  revoked_reason public.session_revoked_reason null,
  device_type text null,
  browser text null,
  -- no IP, geolocation or user-agent string columns (CL-037)
  constraint session_registry_staff_fk foreign key (tenant_id, staff_id) references public.tenant_staff (tenant_id, id),
  constraint session_registry_owner_ck check (
    (staff_id is not null and tenant_id is not null and platform_admin_id is null)
    or (staff_id is null and tenant_id is null and platform_admin_id is not null)),
  constraint session_registry_revoke_ck check ((revoked_at is null) = (revoked_reason is null))
);
create index session_registry_user_idx on public.session_registry (auth_user_id);
create index session_registry_staff_idx on public.session_registry (tenant_id, staff_id);

alter table public.session_registry enable row level security;
alter table public.session_registry force row level security;
revoke all on public.session_registry from anon, authenticated;
revoke delete, truncate on public.session_registry from service_role;

-- True only for the caller's own registered, unrevoked session that had verified activity in the last 30 days.
create function private.current_session_is_live() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session_registry sr
    where sr.provider_session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and sr.auth_user_id = (select auth.uid())
      and sr.revoked_at is null
      and sr.verified_activity_at > now() - interval '30 days')
$$;
revoke all on function private.current_session_is_live() from public, anon, authenticated;
grant execute on function private.current_session_is_live() to authenticated, service_role;

create function private.revoke_sessions(p_session_ids uuid[], p_reason public.session_revoked_reason)
returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  update public.session_registry
     set revoked_at = now(), revoked_reason = p_reason
   where provider_session_id = any (p_session_ids) and revoked_at is null;
  get diagnostics n = row_count;
  delete from auth.sessions where id = any (p_session_ids);
  return n;
end $$;
revoke all on function private.revoke_sessions(uuid[], public.session_revoked_reason) from public, anon, authenticated;
grant execute on function private.revoke_sessions(uuid[], public.session_revoked_reason) to service_role;
