-- T029 tenant staff (rows exist only for activated accounts)

create table public.tenant_staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  auth_user_id uuid not null unique references auth.users (id),
  email text not null,
  email_normalized text not null unique,  -- global across tenants, includes disabled staff (CL-048)
  username text not null check (
    char_length(username) between 3 and 30 and username ~ '^[A-Za-z]+(?:[._][A-Za-z]+)*$'),
  username_normalized text generated always as (lower(username)) stored,
  enabled boolean not null default true,
  activated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint tenant_staff_email_norm_ck check (email_normalized = private.normalize_email(email)),
  constraint tenant_staff_tenant_id_id_key unique (tenant_id, id),
  constraint tenant_staff_username_tenant_key unique (tenant_id, username_normalized)
);
create index tenant_staff_tenant_id_idx on public.tenant_staff (tenant_id);

create function private.tenant_staff_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- the Auth identity must exist, carry the same normalized email, and not be a platform admin
    if not exists (select 1 from auth.users u
                   where u.id = new.auth_user_id and private.normalize_email(u.email) = new.email_normalized) then
      raise exception 'auth_identity_mismatch' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.platform_admins a where a.auth_user_id = new.auth_user_id) then
      raise exception 'identity_unavailable' using errcode = 'P0001';
    end if;
  else
    if new.tenant_id is distinct from old.tenant_id
       or new.auth_user_id is distinct from old.auth_user_id
       or new.email is distinct from old.email
       or new.email_normalized is distinct from old.email_normalized then
      raise exception 'staff_identity_immutable' using errcode = 'P0001';  -- CL-012
    end if;
  end if;
  return new;
end $$;
create trigger tenant_staff_guard_ins before insert on public.tenant_staff
  for each row execute function private.tenant_staff_guard();
create trigger tenant_staff_guard_upd before update on public.tenant_staff
  for each row execute function private.tenant_staff_guard();

alter table public.tenant_staff enable row level security;
alter table public.tenant_staff force row level security;
revoke all on public.tenant_staff from anon, authenticated;
revoke delete, truncate on public.tenant_staff from service_role;
