-- T142 staff administration RPCs (FR-008, FR-022, FR-023, CL-044). No RPC edits email or username (CL-012).
-- Same convention as the role RPCs: no authority raises 42501; audited business denials are returned as {ok:false,error}.

create function public.set_staff_roles(p_staff_id uuid, p_add uuid[], p_remove uuid[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_actor uuid := (select private.current_staff_id());
  v_add uuid[];
  v_remove uuid[];
  v_role uuid;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('staff.roles.assign')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct r), '{}') into v_add from unnest(coalesce(p_add, '{}')) r;
  select coalesce(array_agg(distinct r), '{}') into v_remove from unnest(coalesce(p_remove, '{}')) r;
  perform private.rbac_lock(v_tenant);
  -- CL-044: never one's own memberships (add, remove, swap, bulk), even when only reducing authority
  if p_staff_id = v_actor then
    return private.rbac_deny(v_tenant, v_actor, 'staff', 'staff.roles_denied', 'cannot_change_own_roles',
      'authz.self_membership_denied', 'tenant_staff', p_staff_id::text);
  end if;
  if not exists (select 1 from public.tenant_staff s where s.id = p_staff_id and s.tenant_id = v_tenant) then
    raise exception 'staff_not_found' using errcode = 'P0001';
  end if;
  if v_add && v_remove then raise exception 'roles_invalid' using errcode = 'P0001'; end if;
  foreach v_role in array v_add loop
    if not private.actor_can_grant_role(v_role) then   -- inactive, foreign or above the ceiling
      return private.rbac_deny(v_tenant, v_actor, 'staff', 'staff.roles_denied', 'role_not_grantable',
        'authz.privilege_escalation_denied', 'tenant_staff', p_staff_id::text, jsonb_build_object('roleId', v_role));
    end if;
  end loop;
  foreach v_role in array v_remove loop
    if not private.actor_covers_role(v_role) then
      return private.rbac_deny(v_tenant, v_actor, 'staff', 'staff.roles_denied', 'role_not_grantable',
        'authz.privilege_escalation_denied', 'tenant_staff', p_staff_id::text, jsonb_build_object('roleId', v_role));
    end if;
  end loop;
  foreach v_role in array v_add loop
    insert into public.staff_roles (tenant_id, staff_id, role_id, assigned_by_staff_id)
    values (v_tenant, p_staff_id, v_role, v_actor) on conflict do nothing;
    if found then
      perform private.write_tenant_audit(v_tenant, 'staff', v_actor, null, 'staff', 'staff.role_added', 'tenant_staff',
        p_staff_id::text, jsonb_build_object('roleId', v_role));
    end if;
  end loop;
  foreach v_role in array v_remove loop
    delete from public.staff_roles where staff_id = p_staff_id and role_id = v_role and tenant_id = v_tenant;
    if found then
      perform private.write_tenant_audit(v_tenant, 'staff', v_actor, null, 'staff', 'staff.role_removed', 'tenant_staff',
        p_staff_id::text, jsonb_build_object('roleId', v_role));
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

create function public.disable_staff(p_staff_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_actor uuid := (select private.current_staff_id());
  v_target public.tenant_staff;
  v_target_is_manager boolean;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('staff.disable')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.tenants t where t.id = v_tenant for update;   -- serializes with other disables and manager demotion
  select * into v_target from public.tenant_staff s where s.id = p_staff_id and s.tenant_id = v_tenant for update;
  if not found then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  if v_target.id = v_actor then
    return private.rbac_deny(v_tenant, v_actor, 'staff', 'staff.disable_denied', 'cannot_disable_self', null, 'tenant_staff', p_staff_id::text);
  end if;
  if not v_target.enabled then return jsonb_build_object('ok', true); end if;   -- idempotent
  v_target_is_manager := exists (select 1 from public.tenant_manager_grants g
                                 where g.tenant_id = v_tenant and g.staff_id = v_target.id and g.revoked_at is null);
  if v_target_is_manager then
    -- manager authority is platform-protected: a delegate may not neutralize a manager
    if not private.is_active_tenant_manager() then
      return private.rbac_deny(v_tenant, v_actor, 'staff', 'staff.disable_denied', 'manager_protected',
        'authz.privilege_escalation_denied', 'tenant_staff', p_staff_id::text);
    end if;
    if not exists (
      select 1 from public.tenant_manager_grants g
      join public.tenant_staff s on s.id = g.staff_id and s.tenant_id = g.tenant_id
      where g.tenant_id = v_tenant and g.revoked_at is null and g.staff_id <> v_target.id and s.enabled) then
      return private.rbac_deny(v_tenant, v_actor, 'staff', 'staff.disable_denied', 'last_active_manager', null, 'tenant_staff', p_staff_id::text);
    end if;
  end if;
  update public.tenant_staff set enabled = false where id = v_target.id;
  perform private.revoke_user_sessions(v_target.auth_user_id, null, 'disabled');
  perform private.write_tenant_audit(v_tenant, 'staff', v_actor, null, 'staff', 'staff.disabled', 'tenant_staff', v_target.id::text, '{}');
  return jsonb_build_object('ok', true);
end $$;

create function public.enable_staff(p_staff_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_actor uuid := (select private.current_staff_id());
  v_enabled boolean;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('staff.enable')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select s.enabled into v_enabled from public.tenant_staff s where s.id = p_staff_id and s.tenant_id = v_tenant for update;
  if not found then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  if v_enabled then return jsonb_build_object('ok', true); end if;   -- idempotent
  update public.tenant_staff set enabled = true where id = p_staff_id;
  perform private.write_tenant_audit(v_tenant, 'staff', v_actor, null, 'staff', 'staff.enabled', 'tenant_staff', p_staff_id::text, '{}');
  return jsonb_build_object('ok', true);
end $$;

create function private.staff_json(p_tenant uuid, p_staff_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'username', s.username, 'email', s.email, 'enabled', s.enabled, 'activatedAt', s.activated_at,
    'isManager', exists (select 1 from public.tenant_manager_grants g
                         where g.tenant_id = s.tenant_id and g.staff_id = s.id and g.revoked_at is null),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
                         'canGrant', private.actor_covers_role(r.id)) order by r.name_normalized)
                       from public.staff_roles sr join public.roles r on r.id = sr.role_id
                       where sr.staff_id = s.id), '[]'::jsonb)
  ) order by s.username_normalized), '[]'::jsonb)
  from public.tenant_staff s
  where s.tenant_id = p_tenant and (p_staff_id is null or s.id = p_staff_id)
$$;
revoke all on function private.staff_json(uuid, uuid) from public, anon, authenticated;
grant execute on function private.staff_json(uuid, uuid) to service_role;

create function public.list_staff() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('staff.view')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return private.staff_json((select private.current_tenant_id()), null);
end $$;

create function public.get_staff(p_staff_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('staff.view')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v := private.staff_json((select private.current_tenant_id()), p_staff_id) -> 0;
  if v is null then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'set_staff_roles(uuid, uuid[], uuid[])', 'disable_staff(uuid)', 'enable_staff(uuid)', 'list_staff()', 'get_staff(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
