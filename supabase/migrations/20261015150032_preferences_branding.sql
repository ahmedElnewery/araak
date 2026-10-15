-- T155 preferences and tenant branding (FR-036, FR-039, FR-035).
-- Preferences are per staff member (locale, theme). Branding is the manager's authority, never a grantable permission.
-- Logo objects live in the private `tenant-logos` bucket under `<tenant_id>/<uuid>.<ext>`; only server code writes them.

create table public.tenant_preferences (
  staff_id uuid primary key,
  tenant_id uuid not null,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  theme_mode text not null default 'system' check (theme_mode in ('system', 'light', 'dark')),
  updated_at timestamptz not null default now(),
  constraint tenant_preferences_staff_fk foreign key (tenant_id, staff_id) references public.tenant_staff (tenant_id, id)
);
create index tenant_preferences_tenant_idx on public.tenant_preferences (tenant_id);

alter table public.tenant_preferences enable row level security;
alter table public.tenant_preferences force row level security;
revoke all on public.tenant_preferences from anon, authenticated;
revoke delete, truncate on public.tenant_preferences from service_role;

create function public.get_my_preferences() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select jsonb_build_object('locale', p.locale, 'theme_mode', p.theme_mode) into r
    from public.tenant_preferences p where p.staff_id = private.current_staff_id();
  return r;  -- null until the person picks something
end $$;

create function public.set_my_preferences(p_locale text, p_theme text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_staff public.tenant_staff := private.current_staff();
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_locale is not null and p_locale not in ('ar', 'en') then raise exception 'preference_invalid' using errcode = 'P0001'; end if;
  if p_theme is not null and p_theme not in ('system', 'light', 'dark') then raise exception 'preference_invalid' using errcode = 'P0001'; end if;
  insert into public.tenant_preferences (staff_id, tenant_id, locale, theme_mode)
  values (v_staff.id, v_staff.tenant_id, coalesce(p_locale, 'ar'), coalesce(p_theme, 'system'))
  on conflict (staff_id) do update
    set locale = coalesce(p_locale, public.tenant_preferences.locale),
        theme_mode = coalesce(p_theme, public.tenant_preferences.theme_mode),
        updated_at = now();
end $$;

-- Name rules mirror docs/decisions/branding.md section 3; the app applies the stricter Unicode-class check.
create function private.valid_tenant_display_name(p_name text) returns boolean
language sql immutable set search_path = ''
as $$ select p_name is not null and char_length(p_name) between 1 and 80 and p_name !~ '[[:cntrl:]<>]' $$;

create function private.valid_logo_path(p_tenant_id uuid, p_path text) returns boolean
language sql immutable set search_path = ''
as $$ select p_path ~ ('^' || p_tenant_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$') $$;

-- Manager only (is_active_tenant_manager), never a grantable permission. Returns the previous logo path so the server
-- can delete the old object after the commit.
create function public.update_tenant_branding(p_display_name text, p_logo_object_path text, p_remove_logo boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.tenant_staff := private.current_staff();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_old public.tenants;
  v_new_path text;
  v_logo_changed boolean;
begin
  if not private.is_active_tenant_manager() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'name_required' using errcode = 'P0001'; end if;
  if not private.valid_tenant_display_name(v_name) then raise exception 'name_invalid' using errcode = 'P0001'; end if;
  if p_logo_object_path is not null and not coalesce(p_remove_logo, false)
     and not private.valid_logo_path(v_staff.tenant_id, p_logo_object_path) then
    raise exception 'logo_invalid' using errcode = 'P0001';
  end if;
  select * into v_old from public.tenants where id = v_staff.tenant_id for update;
  v_new_path := case when coalesce(p_remove_logo, false) then null
                     when p_logo_object_path is not null then p_logo_object_path
                     else v_old.logo_object_path end;
  v_logo_changed := v_new_path is distinct from v_old.logo_object_path;
  update public.tenants
     set display_name = v_name, logo_object_path = v_new_path,
         logo_version = v_old.logo_version + case when v_logo_changed then 1 else 0 end, updated_at = now()
   where id = v_old.id;
  perform private.write_tenant_audit(v_old.id, 'staff', v_staff.id, null, 'tenant_settings', 'tenant.branding_updated',
    'tenant', v_old.id::text,
    jsonb_build_object('nameChanged', v_name is distinct from v_old.display_name,
                       'logo', case when not v_logo_changed then 'unchanged' when v_new_path is null then 'removed'
                                    when v_old.logo_object_path is null then 'added' else 'replaced' end));
  return jsonb_build_object('logoVersion', v_old.logo_version + case when v_logo_changed then 1 else 0 end,
                            'previousLogoPath', case when v_logo_changed then v_old.logo_object_path end);
end $$;

-- Platform intervention (FR-036): `tenants.manage`, audited on both sides.
create function public.platform_update_tenant_logo(p_tenant_id uuid, p_logo_object_path text, p_remove boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old public.tenants;
  v_new_path text;
  v_logo_changed boolean;
begin
  if not private.is_platform_admin('tenants.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into v_old from public.tenants where id = p_tenant_id for update;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  if p_logo_object_path is not null and not coalesce(p_remove, false)
     and not private.valid_logo_path(p_tenant_id, p_logo_object_path) then
    raise exception 'logo_invalid' using errcode = 'P0001';
  end if;
  v_new_path := case when coalesce(p_remove, false) then null
                     when p_logo_object_path is not null then p_logo_object_path
                     else v_old.logo_object_path end;
  v_logo_changed := v_new_path is distinct from v_old.logo_object_path;
  if not v_logo_changed then return jsonb_build_object('logoVersion', v_old.logo_version, 'previousLogoPath', null); end if;
  update public.tenants set logo_object_path = v_new_path, logo_version = v_old.logo_version + 1, updated_at = now()
   where id = p_tenant_id;
  perform private.write_platform_audit(v_actor, null, 'tenant.logo_updated',
    jsonb_build_object('tenantId', p_tenant_id, 'logo', case when v_new_path is null then 'removed' else 'set' end));
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'tenant_settings', 'tenant.logo_updated',
    'tenant', p_tenant_id::text, jsonb_build_object('logo', case when v_new_path is null then 'removed' else 'set' end));
  return jsonb_build_object('logoVersion', v_old.logo_version + 1, 'previousLogoPath', v_old.logo_object_path);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'get_my_preferences()', 'set_my_preferences(text, text)',
    'update_tenant_branding(text, text, boolean)', 'platform_update_tenant_logo(uuid, text, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- helpers are server-side only (never callable by authenticated/anon)
revoke all on function private.valid_tenant_display_name(text) from public, anon, authenticated;
revoke all on function private.valid_logo_path(uuid, text) from public, anon, authenticated;
grant execute on function private.valid_tenant_display_name(text), private.valid_logo_path(uuid, text) to service_role;

-- The admin detail page also needs to know whether a logo exists (metadata only, FR-029): same signature, two new keys.
create or replace function public.platform_get_tenant(p_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  if not private.is_platform_admin('tenants.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select jsonb_build_object('id', t.id, 'display_name', t.display_name, 'subdomain', t.subdomain, 'state', t.state,
                            'created_at', t.created_at, 'updated_at', t.updated_at,
                            'has_logo', t.logo_object_path is not null, 'logo_version', t.logo_version)
    into r from public.tenants t where t.id = p_tenant_id;
  if r is null then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  return r;
end $$;
