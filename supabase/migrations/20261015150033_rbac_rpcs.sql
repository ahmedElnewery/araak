-- T141 role administration RPCs (FR-023, FR-026, CL-027..CL-031).
-- Authority failures (no permission at all) raise 42501. Business denials that must leave an audit trail
-- (ceiling, self-edit, assigned role, name conflict) are RETURNED as {ok:false,error} after the audit write,
-- because a raised error would roll the audit row back. Every mutation takes private.rbac_lock(tenant).

-- Archive racing a concurrent assignment: the guard share-locks the role row, archive locks it FOR UPDATE and
-- counts memberships afterwards, so an archived role can never keep (or gain) a membership.
create or replace function private.staff_roles_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_archived timestamptz;
begin
  select r.archived_at into v_archived from public.roles r where r.id = new.role_id for share;
  if v_archived is not null then
    raise exception 'role_archived' using errcode = 'P0001';  -- CL-029
  end if;
  return new;
end $$;

-- Writes the audit (and optionally a security event) of a denied operation and builds the error result.
create function private.rbac_deny(
  p_tenant_id uuid, p_actor_staff_id uuid, p_category text, p_event text, p_error text,
  p_security_event text, p_resource_type text, p_resource_id text, p_metadata jsonb default '{}'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.write_tenant_audit(p_tenant_id, 'staff', p_actor_staff_id, null, p_category, p_event,
    p_resource_type, p_resource_id, coalesce(p_metadata, '{}') || jsonb_build_object('reason', p_error));
  if p_security_event is not null then
    perform private.write_security_event(p_tenant_id, p_actor_staff_id, p_security_event,
      coalesce(p_metadata, '{}') || jsonb_build_object('reason', p_error, 'resourceId', p_resource_id));
  end if;
  return jsonb_build_object('ok', false, 'error', p_error);
end $$;
revoke all on function private.rbac_deny(uuid, uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function private.rbac_deny(uuid, uuid, text, text, text, text, text, text, jsonb) to service_role;

-- Normalizes a grants payload: [{key, scope?, auditCategories?}] -> rows. Raises grants_invalid on any malformation.
create function private.parse_grants(p_grants jsonb)
returns table (permission_key text, scope public.record_scope, audit_categories text[])
language plpgsql immutable set search_path = ''
as $$
declare e jsonb; v_scope public.record_scope; v_cats text[]; v_seen text[] := '{}';
begin
  if p_grants is null or jsonb_typeof(p_grants) <> 'array' or jsonb_array_length(p_grants) > 50 then
    raise exception 'grants_invalid' using errcode = 'P0001';
  end if;
  for e in select * from jsonb_array_elements(p_grants) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'key') <> 'string' then
      raise exception 'grants_invalid' using errcode = 'P0001';
    end if;
    begin
      v_scope := coalesce(nullif(e ->> 'scope', ''), 'all')::public.record_scope;
    exception when invalid_text_representation then
      raise exception 'grants_invalid' using errcode = 'P0001';
    end;
    if e -> 'auditCategories' is null or jsonb_typeof(e -> 'auditCategories') = 'null' then
      v_cats := null;
    elsif jsonb_typeof(e -> 'auditCategories') = 'array'
          and not exists (select 1 from jsonb_array_elements(e -> 'auditCategories') x where jsonb_typeof(x) <> 'string') then
      select array_agg(distinct x) into v_cats from jsonb_array_elements_text(e -> 'auditCategories') x;
    else
      raise exception 'grants_invalid' using errcode = 'P0001';
    end if;
    if (e ->> 'key') = any (v_seen) then raise exception 'grants_invalid' using errcode = 'P0001'; end if;
    v_seen := v_seen || (e ->> 'key');
    permission_key := e ->> 'key'; scope := v_scope; audit_categories := v_cats;
    return next;
  end loop;
end $$;
revoke all on function private.parse_grants(jsonb) from public, anon, authenticated;
grant execute on function private.parse_grants(jsonb) to service_role;

-- Like actor_can_grant_role, but also for ARCHIVED roles (restore, and removing a membership of any role).
create function private.actor_covers_role(p_role_id uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.request_context_ok() then return false; end if;
  if not exists (select 1 from public.roles r
                 where r.id = p_role_id and r.tenant_id = (select private.current_tenant_id())) then
    return false;
  end if;
  return not exists (
    select 1 from public.permission_grants pg
    where pg.role_id = p_role_id
      and not private.actor_can_grant(pg.permission_key, pg.scope, pg.audit_categories));
end $$;
revoke all on function private.actor_covers_role(uuid) from public, anon, authenticated;
grant execute on function private.actor_covers_role(uuid) to service_role;

-- First grant (in payload order) above the actor's ceiling, or null. Records nothing.
create function private.first_grant_above_ceiling(p_rows jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare g record;
begin
  for g in select * from jsonb_to_recordset(p_rows) as x(permission_key text, scope public.record_scope, audit_categories text[]) loop
    if not private.actor_can_grant(g.permission_key, g.scope, g.audit_categories) then return g.permission_key; end if;
  end loop;
  return null;
end $$;
revoke all on function private.first_grant_above_ceiling(jsonb) from public, anon, authenticated;
grant execute on function private.first_grant_above_ceiling(jsonb) to service_role;

create function public.create_role(p_name text, p_description text, p_grants jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_staff uuid := (select private.current_staff_id());
  v_name text := btrim(coalesce(p_name, ''));
  v_rows jsonb;
  v_bad text;
  v_id uuid;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('roles.create')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then raise exception 'role_name_invalid' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(to_jsonb(g)), '[]') into v_rows from private.parse_grants(p_grants) g;
  perform private.rbac_lock(v_tenant);
  v_bad := private.first_grant_above_ceiling(v_rows);
  if v_bad is not null then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.create_denied', 'privilege_escalation',
      'authz.privilege_escalation_denied', 'role', null, jsonb_build_object('permission', v_bad));
  end if;
  if exists (select 1 from public.roles r where r.tenant_id = v_tenant and r.archived_at is null
             and r.name_normalized = lower(v_name)) then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.create_denied', 'role_name_conflict', null, 'role', null);
  end if;
  insert into public.roles (tenant_id, name, description) values (v_tenant, v_name, nullif(btrim(coalesce(p_description, '')), ''))
  returning id into v_id;
  insert into public.permission_grants (tenant_id, role_id, permission_key, scope, audit_categories)
  select v_tenant, v_id, g.permission_key, g.scope, g.audit_categories from jsonb_to_recordset(v_rows)
    as g(permission_key text, scope public.record_scope, audit_categories text[]);
  perform private.write_tenant_audit(v_tenant, 'staff', v_staff, null, 'roles', 'role.created', 'role', v_id::text,
    jsonb_build_object('name', v_name, 'permissions', (select coalesce(jsonb_agg(x ->> 'permission_key' order by x ->> 'permission_key'), '[]') from jsonb_array_elements(v_rows) x)));
  return jsonb_build_object('ok', true, 'roleId', v_id);
end $$;

create function public.update_role(p_role_id uuid, p_name text, p_description text, p_grants jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_staff uuid := (select private.current_staff_id());
  v_name text := btrim(coalesce(p_name, ''));
  v_rows jsonb;
  v_changed jsonb;
  v_bad text;
  v_role public.roles;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('roles.update')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then raise exception 'role_name_invalid' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(to_jsonb(g)), '[]') into v_rows from private.parse_grants(p_grants) g;
  perform private.rbac_lock(v_tenant);
  select * into v_role from public.roles r where r.id = p_role_id and r.tenant_id = v_tenant for update;
  if not found then raise exception 'role_not_found' using errcode = 'P0001'; end if;
  -- CL-027: even a reducing edit of a role the actor holds is refused (the membership check runs under the lock)
  if exists (select 1 from public.staff_roles sr where sr.role_id = p_role_id and sr.staff_id = v_staff) then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.update_denied', 'role_self_edit',
      'authz.role_self_edit_denied', 'role', p_role_id::text);
  end if;
  -- ceiling on every grant that is added, removed or changed
  select coalesce(jsonb_agg(c), '[]') into v_changed from (
    select jsonb_build_object('permission_key', n.permission_key, 'scope', n.scope, 'audit_categories', n.audit_categories) c
    from jsonb_to_recordset(v_rows) as n(permission_key text, scope public.record_scope, audit_categories text[])
    where not exists (select 1 from public.permission_grants o where o.role_id = p_role_id
                      and o.permission_key = n.permission_key and o.scope = n.scope
                      and o.audit_categories is not distinct from n.audit_categories)
    union all
    select jsonb_build_object('permission_key', o.permission_key, 'scope', o.scope, 'audit_categories', o.audit_categories)
    from public.permission_grants o
    where o.role_id = p_role_id
      and not exists (select 1 from jsonb_to_recordset(v_rows) as n(permission_key text, scope public.record_scope, audit_categories text[])
                      where o.permission_key = n.permission_key and o.scope = n.scope
                        and o.audit_categories is not distinct from n.audit_categories)) q;
  v_bad := private.first_grant_above_ceiling(v_changed);
  if v_bad is not null then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.update_denied', 'privilege_escalation',
      'authz.privilege_escalation_denied', 'role', p_role_id::text, jsonb_build_object('permission', v_bad));
  end if;
  if v_role.archived_at is null and exists (
       select 1 from public.roles r where r.tenant_id = v_tenant and r.archived_at is null
         and r.id <> p_role_id and r.name_normalized = lower(v_name)) then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.update_denied', 'role_name_conflict', null, 'role', p_role_id::text);
  end if;
  update public.roles set name = v_name, description = nullif(btrim(coalesce(p_description, '')), ''), updated_at = now()
   where id = p_role_id;
  delete from public.permission_grants where role_id = p_role_id;
  insert into public.permission_grants (tenant_id, role_id, permission_key, scope, audit_categories)
  select v_tenant, p_role_id, g.permission_key, g.scope, g.audit_categories from jsonb_to_recordset(v_rows)
    as g(permission_key text, scope public.record_scope, audit_categories text[]);
  perform private.write_tenant_audit(v_tenant, 'staff', v_staff, null, 'roles', 'role.updated', 'role', p_role_id::text,
    jsonb_build_object('name', v_name, 'permissions', (select coalesce(jsonb_agg(x ->> 'permission_key' order by x ->> 'permission_key'), '[]') from jsonb_array_elements(v_rows) x)));
  return jsonb_build_object('ok', true, 'roleId', p_role_id);
end $$;

create function public.archive_role(p_role_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_staff uuid := (select private.current_staff_id());
  v_role public.roles;
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('roles.archive')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.rbac_lock(v_tenant);
  select * into v_role from public.roles r where r.id = p_role_id and r.tenant_id = v_tenant for update;  -- blocks the membership guard
  if not found then raise exception 'role_not_found' using errcode = 'P0001'; end if;
  if v_role.archived_at is not null then
    return jsonb_build_object('ok', true, 'roleId', p_role_id);   -- idempotent
  end if;
  -- CL-028: any membership blocks archival, including memberships of disabled staff; nothing is removed
  if exists (select 1 from public.staff_roles sr where sr.role_id = p_role_id) then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.archive_denied', 'role_assigned', null, 'role', p_role_id::text);
  end if;
  update public.roles set archived_at = now(), updated_at = now() where id = p_role_id;
  perform private.write_tenant_audit(v_tenant, 'staff', v_staff, null, 'roles', 'role.archived', 'role', p_role_id::text,
    jsonb_build_object('name', v_role.name));
  return jsonb_build_object('ok', true, 'roleId', p_role_id);
end $$;

create function public.restore_role(p_role_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_staff uuid := (select private.current_staff_id());
  v_role public.roles;
begin
  -- generic role management alone never restores (CL-030)
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('roles.restore')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.rbac_lock(v_tenant);
  select * into v_role from public.roles r where r.id = p_role_id and r.tenant_id = v_tenant for update;
  if not found then raise exception 'role_not_found' using errcode = 'P0001'; end if;
  if v_role.archived_at is null then
    return jsonb_build_object('ok', true, 'roleId', p_role_id);   -- idempotent
  end if;
  if not private.actor_covers_role(p_role_id) then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.restore_denied', 'privilege_escalation',
      'authz.privilege_escalation_denied', 'role', p_role_id::text);
  end if;
  if exists (select 1 from public.roles r where r.tenant_id = v_tenant and r.archived_at is null
             and r.id <> p_role_id and r.name_normalized = v_role.name_normalized) then
    return private.rbac_deny(v_tenant, v_staff, 'roles', 'role.restore_denied', 'role_name_conflict', null, 'role', p_role_id::text);
  end if;
  update public.roles set archived_at = null, updated_at = now() where id = p_role_id;   -- no memberships return
  perform private.write_tenant_audit(v_tenant, 'staff', v_staff, null, 'roles', 'role.restored', 'role', p_role_id::text,
    jsonb_build_object('name', v_role.name));
  return jsonb_build_object('ok', true, 'roleId', p_role_id);
end $$;

-- Roles of the actor's tenant with grants, membership counts and whether the actor holds the role (read-only UI hint).
create function public.list_roles() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_tenant uuid := (select private.current_tenant_id()); v_staff uuid := (select private.current_staff_id());
begin
  if not private.request_context_ok() or not (private.is_active_tenant_manager() or private.has_permission('roles.view')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'description', r.description, 'archivedAt', r.archived_at,
      'assignedCount', (select count(*) from public.staff_roles sr where sr.role_id = r.id),
      'heldByActor', exists (select 1 from public.staff_roles sr where sr.role_id = r.id and sr.staff_id = v_staff),
      'canGrant', private.actor_covers_role(r.id),
      'grants', coalesce((select jsonb_agg(jsonb_build_object('key', pg.permission_key, 'scope', pg.scope,
                  'auditCategories', pg.audit_categories) order by pg.permission_key)
                  from public.permission_grants pg where pg.role_id = r.id), '[]'::jsonb)
    ) order by (r.archived_at is not null), r.name_normalized)
    from public.roles r where r.tenant_id = v_tenant), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_role(text, text, jsonb)', 'update_role(uuid, text, text, jsonb)', 'archive_role(uuid)',
    'restore_role(uuid)', 'list_roles()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
