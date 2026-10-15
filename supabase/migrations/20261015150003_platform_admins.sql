-- T028 platform admins (GATE-COLLIDE default: an email/identity cannot be both admin and staff)

create table public.platform_admins (
  auth_user_id uuid primary key references auth.users (id),
  enabled boolean not null default true,
  capabilities text[] not null check (
    capabilities <@ array['tenants.manage','tenants.managers.manage','tenants.staff.manage',
                          'platform_admins.invite','platform_audit.view']::text[]),
  created_via text not null check (created_via in ('bootstrap', 'invitation')),
  created_at timestamptz not null default now()
);

-- Single-row table (CL-043): records that the first platform admin was bootstrapped.
create table private.platform_bootstrap_state (
  id boolean primary key default true check (id),
  bootstrapped_at timestamptz not null default now(),
  operator_ref text not null
);
alter table private.platform_bootstrap_state enable row level security;
alter table private.platform_bootstrap_state force row level security;

create function private.platform_admins_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.tenant_staff s where s.auth_user_id = new.auth_user_id) then
    raise exception 'identity_unavailable' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'platform_admin_identity_immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger platform_admins_guard_ins before insert on public.platform_admins
  for each row execute function private.platform_admins_guard();
create trigger platform_admins_guard_upd before update on public.platform_admins
  for each row execute function private.platform_admins_guard();

alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
revoke all on public.platform_admins from anon, authenticated;
revoke delete, truncate on public.platform_admins from service_role;
