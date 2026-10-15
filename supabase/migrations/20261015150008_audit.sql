-- T033 append-only audit tables and writers

create table public.tenant_audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id),
  actor_kind text not null check (actor_kind in ('staff', 'platform_admin', 'system')),
  actor_staff_id uuid null,
  actor_platform_admin_id uuid null,
  category text not null check (category in ('staff','invitations','roles','tenant_settings','sessions')),
  event text not null,
  resource_type text null,
  resource_id text null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  constraint tenant_audit_actor_fk foreign key (tenant_id, actor_staff_id) references public.tenant_staff (tenant_id, id)
);
create index tenant_audit_events_tenant_idx on public.tenant_audit_events (tenant_id, category, occurred_at desc);

create table public.tenant_security_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id),
  actor_staff_id uuid null,
  event text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  constraint tenant_security_actor_fk foreign key (tenant_id, actor_staff_id) references public.tenant_staff (tenant_id, id)
);
create index tenant_security_events_tenant_idx on public.tenant_security_events (tenant_id, occurred_at desc);

create table public.platform_audit_events (
  id bigint generated always as identity primary key,
  actor_platform_admin_id uuid null references public.platform_admins (auth_user_id),
  actor_operator_ref text null,
  event text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create index platform_audit_events_occurred_idx on public.platform_audit_events (occurred_at desc);

create table public.audit_legal_holds (
  id bigint generated always as identity primary key,
  target text not null check (target in ('tenant_audit', 'tenant_security', 'platform_audit')),
  tenant_id uuid null references public.tenants (id),
  category text null,
  from_ts timestamptz not null,
  until_ts timestamptz not null,
  approved_by text not null,
  created_at timestamptz not null default now()
);

create function private.audit_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.retention_purge', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return null;
  end if;
  raise exception 'audit_append_only' using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array['tenant_audit_events','tenant_security_events','platform_audit_events','audit_legal_holds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('revoke insert, update, delete, truncate on public.%I from service_role', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.audit_append_only()', t || '_ro', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function private.audit_append_only()', t || '_ro_trunc', t);
  end loop;
end $$;
-- legal holds are written by an operator, not by service_role at run time
grant select on public.audit_legal_holds to service_role;

-- Drops keys that look like secrets, at any depth.
create function private.sanitize_audit_metadata(p_meta jsonb) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare k text; v jsonb; out jsonb := '{}'; e jsonb;
begin
  if p_meta is null then return '{}'; end if;
  if jsonb_typeof(p_meta) = 'array' then
    out := '[]';
    for e in select * from jsonb_array_elements(p_meta) loop
      out := out || jsonb_build_array(private.sanitize_audit_metadata(e));
    end loop;
    return out;
  elsif jsonb_typeof(p_meta) <> 'object' then
    return p_meta;
  end if;
  for k, v in select * from jsonb_each(p_meta) loop
    if k ~* '(password|token|secret|key|otp|code)' then continue; end if;
    out := out || jsonb_build_object(k, case when jsonb_typeof(v) in ('object','array')
                                             then private.sanitize_audit_metadata(v) else v end);
  end loop;
  return out;
end $$;

create function private.write_tenant_audit(
  p_tenant_id uuid, p_actor_kind text, p_actor_staff_id uuid, p_actor_platform_admin_id uuid,
  p_category text, p_event text, p_resource_type text default null, p_resource_id text default null,
  p_metadata jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare i bigint;
begin
  insert into public.tenant_audit_events (tenant_id, actor_kind, actor_staff_id, actor_platform_admin_id,
      category, event, resource_type, resource_id, metadata)
  values (p_tenant_id, p_actor_kind, p_actor_staff_id, p_actor_platform_admin_id,
      p_category, p_event, p_resource_type, p_resource_id, private.sanitize_audit_metadata(p_metadata))
  returning id into i;
  return i;
end $$;

create function private.write_security_event(
  p_tenant_id uuid, p_actor_staff_id uuid, p_event text, p_metadata jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare i bigint;
begin
  insert into public.tenant_security_events (tenant_id, actor_staff_id, event, metadata)
  values (p_tenant_id, p_actor_staff_id, p_event, private.sanitize_audit_metadata(p_metadata))
  returning id into i;
  return i;
end $$;

create function private.write_platform_audit(
  p_actor_platform_admin_id uuid, p_actor_operator_ref text, p_event text, p_metadata jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare i bigint;
begin
  insert into public.platform_audit_events (actor_platform_admin_id, actor_operator_ref, event, metadata)
  values (p_actor_platform_admin_id, p_actor_operator_ref, p_event, private.sanitize_audit_metadata(p_metadata))
  returning id into i;
  return i;
end $$;

revoke all on function private.write_tenant_audit(uuid,text,uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function private.write_security_event(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function private.write_platform_audit(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.write_tenant_audit(uuid,text,uuid,uuid,text,text,text,text,jsonb) to service_role;
grant execute on function private.write_security_event(uuid,uuid,text,jsonb) to service_role;
grant execute on function private.write_platform_audit(uuid,text,text,jsonb) to service_role;
