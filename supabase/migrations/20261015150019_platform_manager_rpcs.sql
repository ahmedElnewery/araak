-- T080 protected tenant-manager authority (FR-008, CL-023..CL-026). Every function requires
-- `tenants.managers.manage` and serializes manager changes per tenant through a row lock on the tenant.

create function public.platform_grant_tenant_manager(p_tenant_id uuid, p_staff_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_enabled boolean;
begin
  if not private.is_platform_admin('tenants.managers.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.tenants t where t.id = p_tenant_id for update;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  select s.enabled into v_enabled from public.tenant_staff s where s.id = p_staff_id and s.tenant_id = p_tenant_id;
  if not found then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  if not v_enabled then raise exception 'staff_not_eligible' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tenant_manager_grants g
             where g.tenant_id = p_tenant_id and g.staff_id = p_staff_id and g.revoked_at is null) then
    raise exception 'already_manager' using errcode = 'P0001';
  end if;
  insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  values (p_tenant_id, p_staff_id, v_actor);
  perform private.write_platform_audit(v_actor, null, 'manager.granted',
    jsonb_build_object('tenantId', p_tenant_id, 'staffId', p_staff_id));
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'staff', 'manager.granted',
    'tenant_staff', p_staff_id::text, '{}');
end $$;

create function public.platform_invite_tenant_manager(p_tenant_id uuid, p_email text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if not private.is_platform_admin('tenants.managers.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.tenants t where t.id = p_tenant_id for update;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_email), '') !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'email_invalid' using errcode = 'P0001';
  end if;
  v_id := private.issue_staff_invitation(p_tenant_id, p_email, '{}', true, null, v_actor, p_token_hash);
  perform private.write_platform_audit(v_actor, null, 'manager.invited',
    jsonb_build_object('tenantId', p_tenant_id, 'invitationId', v_id));
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'invitations', 'invitation.issued',
    'staff_invitation', v_id::text, jsonb_build_object('grantsManager', true));
  return v_id;
end $$;

create function public.platform_revoke_tenant_manager(p_tenant_id uuid, p_staff_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_user uuid;
begin
  if not private.is_platform_admin('tenants.managers.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.tenants t where t.id = p_tenant_id for update;   -- serializes concurrent demotions
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.tenant_manager_grants g
                 where g.tenant_id = p_tenant_id and g.staff_id = p_staff_id and g.revoked_at is null) then
    raise exception 'not_a_manager' using errcode = 'P0001';
  end if;
  -- Last-manager invariant: another activated, enabled, unrevoked manager must remain.
  -- Pending invitations do not count. The same rule applies to suspended tenants (flagged for owner
  -- confirmation in docs/decisions/permission-catalog.md).
  if not exists (
    select 1 from public.tenant_manager_grants g
    join public.tenant_staff s on s.id = g.staff_id and s.tenant_id = g.tenant_id
    where g.tenant_id = p_tenant_id and g.revoked_at is null and g.staff_id <> p_staff_id and s.enabled) then
    raise exception 'last_active_manager' using errcode = 'P0001';
  end if;
  update public.tenant_manager_grants
     set revoked_at = now(), revoked_by_platform_admin = v_actor
   where tenant_id = p_tenant_id and staff_id = p_staff_id and revoked_at is null;
  -- the account stays enabled and keeps non-manager roles; every session of the demoted user ends now
  select s.auth_user_id into v_user from public.tenant_staff s where s.id = p_staff_id and s.tenant_id = p_tenant_id;
  perform private.revoke_user_sessions(v_user, null, 'manager_demoted');
  perform private.write_platform_audit(v_actor, null, 'manager.revoked',
    jsonb_build_object('tenantId', p_tenant_id, 'staffId', p_staff_id));
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'staff', 'manager.revoked',
    'tenant_staff', p_staff_id::text, '{}');
end $$;

-- Data for the platform managers panel: active managers, pending manager invitations and the activated staff
-- of THIS tenant that can be promoted. Only usable with tenants.managers.manage.
create function public.platform_get_tenant_managers(p_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin('tenants.managers.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active', coalesce((
      select jsonb_agg(jsonb_build_object('staffId', s.id, 'username', s.username, 'email', s.email,
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
      select jsonb_agg(jsonb_build_object('staffId', s.id, 'username', s.username, 'email', s.email) order by s.username)
      from public.tenant_staff s
      where s.tenant_id = p_tenant_id and s.enabled
        and not exists (select 1 from public.tenant_manager_grants g
                        where g.tenant_id = s.tenant_id and g.staff_id = s.id and g.revoked_at is null)), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'platform_grant_tenant_manager(uuid, uuid)',
    'platform_invite_tenant_manager(uuid, text, text)',
    'platform_revoke_tenant_manager(uuid, uuid)',
    'platform_get_tenant_managers(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
