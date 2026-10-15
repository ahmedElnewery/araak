-- T031 RBAC tables. Catalog seeded from docs/decisions/permission-catalog.md (PENDING OWNER APPROVAL, GATE-RBAC).

create table public.permission_catalog (
  key text primary key,
  resource text not null,
  action text not null,
  supports_scopes public.record_scope[] not null,
  tenant_grantable boolean not null,
  description text not null
);
insert into public.permission_catalog (key, resource, action, supports_scopes, tenant_grantable, description) values
  ('staff.view',        'staff', 'view',        '{all}', true,  'List and open staff of the actor''s tenant'),
  ('staff.invite',      'staff', 'invite',      '{all}', true,  'Issue a staff invitation'),
  ('staff.disable',     'staff', 'disable',     '{all}', true,  'Disable a staff account'),
  ('staff.enable',      'staff', 'enable',      '{all}', true,  'Re-enable a disabled staff account'),
  ('staff.roles.assign','staff', 'roles.assign','{all}', true,  'Add or remove role memberships of other staff'),
  ('roles.view',        'roles', 'view',        '{all}', true,  'List roles and their grants'),
  ('roles.create',      'roles', 'create',      '{all}', true,  'Create a role'),
  ('roles.update',      'roles', 'update',      '{all}', true,  'Rename a role and change its grants'),
  ('roles.archive',     'roles', 'archive',     '{all}', true,  'Archive an unassigned role'),
  ('roles.restore',     'roles', 'restore',     '{all}', true,  'Restore an archived role'),
  ('audit_logs.view',   'audit_logs', 'view',   '{all}', true,  'Read tenant audit events of granted categories'),
  -- manager-only authorities: present so the grant trigger can reject them
  ('tenant.branding.edit',  'tenant', 'branding.edit',  '{all}', false, 'Manager-only: edit tenant branding'),
  ('security_logs.view',    'security_logs', 'view',    '{all}', false, 'Manager-only: view Security Log'),
  ('staff.invitation.resend','staff', 'invitation.resend','{all}', false, 'Manager-only: resend a staff invitation'),
  ('staff.password.reset',  'staff', 'password.reset',  '{all}', false, 'Manager-only: manager-assisted password reset');
alter table public.permission_catalog enable row level security;
alter table public.permission_catalog force row level security;
revoke all on public.permission_catalog from anon, authenticated;
revoke delete, truncate, update, insert on public.permission_catalog from service_role;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  name_normalized text generated always as (lower(btrim(name))) stored,
  description text null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_tenant_id_id_key unique (tenant_id, id)
);
create unique index roles_active_name_uniq on public.roles (tenant_id, name_normalized) where archived_at is null;

create table public.permission_grants (
  tenant_id uuid not null,
  role_id uuid not null,
  permission_key text not null references public.permission_catalog (key),
  scope public.record_scope not null default 'all',
  audit_categories text[] null,
  primary key (role_id, permission_key),
  constraint permission_grants_role_fk foreign key (tenant_id, role_id) references public.roles (tenant_id, id),
  constraint permission_grants_audit_ck check (
    (permission_key = 'audit_logs.view') = (audit_categories is not null)
    and (audit_categories is null or (
      cardinality(audit_categories) > 0
      and audit_categories <@ array['staff','invitations','roles','tenant_settings','sessions']::text[]))
  )
);
create index permission_grants_tenant_role_idx on public.permission_grants (tenant_id, role_id);

create function private.permission_grants_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare c public.permission_catalog;
begin
  select * into c from public.permission_catalog where key = new.permission_key;
  if not c.tenant_grantable then
    raise exception 'permission_not_grantable' using errcode = 'P0001';
  end if;
  if not (new.scope = any (c.supports_scopes)) then
    raise exception 'scope_not_supported' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger permission_grants_guard before insert or update on public.permission_grants
  for each row execute function private.permission_grants_guard();

create table public.staff_roles (
  tenant_id uuid not null,
  staff_id uuid not null,
  role_id uuid not null,
  assigned_by_staff_id uuid null,
  assigned_at timestamptz not null default now(),
  primary key (staff_id, role_id),
  constraint staff_roles_staff_fk foreign key (tenant_id, staff_id) references public.tenant_staff (tenant_id, id),
  constraint staff_roles_role_fk foreign key (tenant_id, role_id) references public.roles (tenant_id, id),
  constraint staff_roles_assigner_fk foreign key (tenant_id, assigned_by_staff_id) references public.tenant_staff (tenant_id, id)
);
create index staff_roles_tenant_idx on public.staff_roles (tenant_id);
create index staff_roles_role_idx on public.staff_roles (role_id);

create function private.staff_roles_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.roles r where r.id = new.role_id and r.archived_at is not null) then
    raise exception 'role_archived' using errcode = 'P0001';  -- CL-029
  end if;
  return new;
end $$;
create trigger staff_roles_guard before insert on public.staff_roles
  for each row execute function private.staff_roles_guard();

create table public.tenant_manager_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_id uuid not null,
  granted_by_platform_admin uuid not null references public.platform_admins (auth_user_id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by_platform_admin uuid null references public.platform_admins (auth_user_id),
  constraint tenant_manager_grants_staff_fk foreign key (tenant_id, staff_id) references public.tenant_staff (tenant_id, id),
  constraint tenant_manager_grants_revoke_ck check ((revoked_at is null) = (revoked_by_platform_admin is null))
);
create unique index tenant_manager_grants_active_uniq on public.tenant_manager_grants (tenant_id, staff_id) where revoked_at is null;
create index tenant_manager_grants_staff_idx on public.tenant_manager_grants (staff_id);

do $$
declare t text;
begin
  foreach t in array array['roles','permission_grants','staff_roles','tenant_manager_grants'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('revoke truncate on public.%I from service_role', t);
  end loop;
end $$;
revoke delete on public.tenant_manager_grants from service_role;
