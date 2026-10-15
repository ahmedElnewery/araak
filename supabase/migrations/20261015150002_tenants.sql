-- T027 tenants

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) > 0),
  subdomain text not null unique check (subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  state public.tenant_state not null default 'active',
  logo_object_path text null,
  logo_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.tenants_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from private.reserved_subdomains r where r.name = new.subdomain) then
      raise exception 'subdomain_reserved' using errcode = 'P0001';
    end if;
  else
    if new.id is distinct from old.id or new.subdomain is distinct from old.subdomain then
      raise exception 'tenant_identity_immutable' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger tenants_guard_ins before insert on public.tenants
  for each row execute function private.tenants_guard();
create trigger tenants_guard_upd before update on public.tenants
  for each row execute function private.tenants_guard();

alter table public.tenants enable row level security;
alter table public.tenants force row level security;
revoke all on public.tenants from anon, authenticated;
revoke delete, truncate on public.tenants from service_role;
