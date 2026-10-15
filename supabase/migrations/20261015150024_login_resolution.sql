-- T112 login resolution and abuse throttling (FR-012, FR-014; docs/decisions/auth-abuse-controls.md, approved 2026-10-15).

create function private.resolve_login_email(p_tenant_id uuid, p_identifier text) returns text
language sql stable security definer set search_path = ''
as $$
  select s.email
  from public.tenant_staff s join public.tenants t on t.id = s.tenant_id
  where s.tenant_id = p_tenant_id and s.enabled and t.state = 'active'
    and case when position('@' in coalesce(p_identifier, '')) > 0
             then s.email_normalized = private.normalize_email(p_identifier)
             else s.username_normalized = lower(btrim(p_identifier)) end
$$;

-- Only HMACs are stored: no raw identifier and no raw IP.
create table private.auth_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  kind text not null check (kind in ('sign_in', 'recovery')),
  identifier_hmac text not null,
  client_ip_hmac text null,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);
create index auth_attempts_identifier_idx on private.auth_attempts (tenant_id, kind, identifier_hmac, attempted_at desc);
create index auth_attempts_ip_idx on private.auth_attempts (tenant_id, kind, client_ip_hmac, attempted_at desc) where client_ip_hmac is not null;
alter table private.auth_attempts enable row level security;
alter table private.auth_attempts force row level security;
revoke all on private.auth_attempts from public, anon, authenticated;

create table private.auth_abuse_limits (
  kind text not null check (kind in ('sign_in', 'recovery')),
  key_type text not null check (key_type in ('identifier', 'ip')),
  max_count int not null check (max_count > 0),
  window_seconds int not null check (window_seconds > 0),
  primary key (kind, key_type)
);
insert into private.auth_abuse_limits (kind, key_type, max_count, window_seconds) values
  ('sign_in', 'identifier', 5, 900), ('sign_in', 'ip', 20, 900),
  ('recovery', 'identifier', 5, 3600), ('recovery', 'ip', 20, 3600);
alter table private.auth_abuse_limits enable row level security;
alter table private.auth_abuse_limits force row level security;
revoke all on private.auth_abuse_limits from public, anon, authenticated;

-- Returns false (throttled) when a limit is already reached; a throttled attempt is not recorded, so the window slides
-- and never extends itself (no permanent lockout). Sign-in counts failures only; recovery counts every request.
create function private.check_and_record_auth_attempt(
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

-- A successful sign-in stops counting as a failure for the identifier (only its own latest attempt).
create function private.record_auth_success(p_tenant_id uuid, p_kind text, p_identifier_hmac text) returns void
language sql security definer set search_path = ''
as $$
  update private.auth_attempts set succeeded = true
   where id = (select max(a.id) from private.auth_attempts a
               where a.tenant_id = p_tenant_id and a.kind = p_kind and a.identifier_hmac = p_identifier_hmac and not a.succeeded)
$$;

create function public.svc_resolve_login_email(p_tenant_id uuid, p_identifier text) returns text
language sql stable security invoker set search_path = ''
as $$ select private.resolve_login_email(p_tenant_id, p_identifier) $$;
create function public.svc_check_and_record_auth_attempt(p_tenant_id uuid, p_kind text, p_identifier_hmac text, p_client_ip_hmac text) returns boolean
language sql security invoker set search_path = ''
as $$ select private.check_and_record_auth_attempt(p_tenant_id, p_kind, p_identifier_hmac, p_client_ip_hmac) $$;
create function public.svc_record_auth_success(p_tenant_id uuid, p_kind text, p_identifier_hmac text) returns void
language sql security invoker set search_path = ''
as $$ select private.record_auth_success(p_tenant_id, p_kind, p_identifier_hmac) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.resolve_login_email(uuid, text)', 'private.check_and_record_auth_attempt(uuid, text, text, text)',
    'private.record_auth_success(uuid, text, text)', 'public.svc_resolve_login_email(uuid, text)',
    'public.svc_check_and_record_auth_attempt(uuid, text, text, text)', 'public.svc_record_auth_success(uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

select cron.schedule('purge-auth-attempts', '0 * * * *',
  $cron$delete from private.auth_attempts where attempted_at < now() - interval '24 hours'$cron$);
