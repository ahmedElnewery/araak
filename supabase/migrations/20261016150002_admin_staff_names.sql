-- The admin app shows staff first and last names too (20261016150001_staff_names). Same rows, same capabilities; the
-- staff and manager lists now carry the names and are ordered by the shown name (the username while there is none).

create or replace function public.platform_list_tenant_staff(p_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin('tenants.staff.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('staffId', s.id, 'username', s.username, 'firstName', s.first_name,
             'lastName', s.last_name, 'email', s.email, 'enabled', s.enabled,
             'isManager', exists (select 1 from public.tenant_manager_grants g
                                  where g.tenant_id = s.tenant_id and g.staff_id = s.id and g.revoked_at is null))
           order by lower(coalesce(s.first_name || ' ' || s.last_name, s.username)), s.username_normalized)
    from public.tenant_staff s where s.tenant_id = p_tenant_id), '[]'::jsonb);
end $$;

create or replace function public.platform_get_tenant_managers(p_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin('tenants.managers.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active', coalesce((
      select jsonb_agg(jsonb_build_object('staffId', s.id, 'username', s.username, 'firstName', s.first_name,
                                          'lastName', s.last_name, 'email', s.email,
                                          'enabled', s.enabled, 'grantedAt', g.granted_at) order by g.granted_at)
      from public.tenant_manager_grants g
      join public.tenant_staff s on s.id = g.staff_id and s.tenant_id = g.tenant_id
      where g.tenant_id = p_tenant_id and g.revoked_at is null), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('invitationId', i.id, 'email', i.recipient_email, 'createdAt', i.created_at,
        'expiresAt', (select max(l.expires_at) from public.staff_invitation_links l where l.invitation_id = i.id)) order by i.created_at)
      from public.staff_invitations i
      where i.tenant_id = p_tenant_id and i.state = 'pending' and i.grants_manager), '[]'::jsonb),
    'eligible', coalesce((
      select jsonb_agg(jsonb_build_object('staffId', s.id, 'username', s.username, 'firstName', s.first_name,
                                          'lastName', s.last_name, 'email', s.email)
                       order by lower(coalesce(s.first_name || ' ' || s.last_name, s.username)), s.username_normalized)
      from public.tenant_staff s
      where s.tenant_id = p_tenant_id and s.enabled
        and not exists (select 1 from public.tenant_manager_grants g
                        where g.tenant_id = s.tenant_id and g.staff_id = s.id and g.revoked_at is null)), '[]'::jsonb));
end $$;
