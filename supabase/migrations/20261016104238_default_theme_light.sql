-- Default theme is Light when nobody has chosen one. An explicit System choice still follows the device.
alter table public.tenant_preferences alter column theme_mode set default 'light';

create or replace function public.set_my_preferences(p_locale text default null, p_theme text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_staff public.tenant_staff := private.current_staff();
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_locale is not null and p_locale not in ('ar', 'en') then raise exception 'preference_invalid' using errcode = 'P0001'; end if;
  if p_theme is not null and p_theme not in ('system', 'light', 'dark') then raise exception 'preference_invalid' using errcode = 'P0001'; end if;
  if p_locale is null and p_theme is null then return; end if;
  insert into public.tenant_preferences (staff_id, tenant_id, locale, theme_mode)
  values (v_staff.id, v_staff.tenant_id, coalesce(p_locale, 'ar'), coalesce(p_theme, 'light'))
  on conflict (staff_id) do update
    set locale = coalesce(p_locale, public.tenant_preferences.locale),
        theme_mode = coalesce(p_theme, public.tenant_preferences.theme_mode),
        updated_at = now();
end $$;
