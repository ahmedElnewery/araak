-- T135 role administration (FR-023, FR-026, CL-027..CL-031)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('rol-a') a, tests.mk_tenant('rol-b') b;
create temp table padm as select tests.mk_user('root@rol.test') uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via) select uid, '{tenants.managers.manage}', 'bootstrap' from padm;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'mgr', s.*, null from tests.mk_staff((select a from fx), 'mgr', 'mgr@rol.test') s;
insert into st select 'ed', s.*, null from tests.mk_staff((select a from fx), 'editor', 'ed@rol.test') s;
insert into st select 'rst', s.*, null from tests.mk_staff((select a from fx), 'rst', 'rst@rol.test') s;
insert into st select 'off', s.*, null from tests.mk_staff((select a from fx), 'offs', 'off@rol.test', false) s;
insert into st select 'bmgr', s.*, null from tests.mk_staff((select b from fx), 'bmgr', 'bmgr@rol.test') s;
update st set sid = tests.mk_session(user_id, case when k = 'bmgr' then (select b from fx) else (select a from fx) end, staff_id) where k <> 'off';
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select case when k = 'bmgr' then (select b from fx) else (select a from fx) end, staff_id, (select uid from padm) from st where k in ('mgr', 'bmgr');

create temp table rl as select
  tests.mk_role((select a from fx), 'Editor') editor, tests.mk_role((select a from fx), 'Restorer') restorer,
  tests.mk_role((select a from fx), 'Plain') plain, tests.mk_role((select a from fx), 'Heavy') heavy,
  tests.mk_role((select a from fx), 'OffOnly') offonly, tests.mk_role((select b from fx), 'Foreign') foreign_role;
insert into public.permission_grants (tenant_id, role_id, permission_key) values
  ((select a from fx), (select editor from rl), 'roles.create'), ((select a from fx), (select editor from rl), 'roles.update'),
  ((select a from fx), (select editor from rl), 'roles.archive'), ((select a from fx), (select editor from rl), 'roles.view'),
  ((select a from fx), (select restorer from rl), 'roles.restore'), ((select a from fx), (select restorer from rl), 'roles.view'),
  ((select a from fx), (select heavy from rl), 'staff.disable'),
  ((select a from fx), (select plain from rl), 'roles.view');
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), staff_id, (select editor from rl) from st where k = 'ed'
  union all select (select a from fx), staff_id, (select restorer from rl) from st where k = 'rst'
  union all select (select a from fx), staff_id, (select offonly from rl) from st where k = 'off';

create function tests.rpc(p_who text, p_call text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform tests.claims((select user_id from st where k = p_who), (select sid from st where k = p_who));
  execute 'select ' || p_call into r;
  perform tests.reset();
  return r;
end $$;
create function tests.err(p_who text, p_call text) returns text language sql as $$ select tests.rpc(p_who, p_call) ->> 'error' $$;
create function tests.as_user(p_who text) returns void language sql as
  $$ select tests.claims((select user_id from st where k = p_who), (select sid from st where k = p_who)) $$;
create function tests.grants_of(p_role uuid) returns text language sql as
  $$ select coalesce(string_agg(permission_key, ',' order by permission_key), '') from public.permission_grants where role_id = p_role $$;
create function tests.n_sec(p_event text) returns bigint language sql as
  $$ select count(*) from public.tenant_security_events where tenant_id = (select a from fx) and event = p_event $$;

-- ceiling
select is(tests.rpc('ed', $$public.create_role('Mine', 'd', '[{"key":"roles.update"}]')$$) ->> 'ok', 'true', 'delegate creates a role within the ceiling');
select is(tests.err('ed', $$public.create_role('Esc', null, '[{"key":"staff.disable"}]')$$), 'privilege_escalation', 'delegate cannot create a role above the ceiling');
select is(tests.n_sec('authz.privilege_escalation_denied'), 1::bigint, 'escalation attempt writes a security event');
select is((select count(*) from public.roles where name = 'Esc'), 0::bigint, 'no role was created by the denied attempt');
select is(tests.err('mgr', $$public.create_role('Mgr only', null, '[{"key":"security_logs.view"}]')$$), 'privilege_escalation', 'a manager-only key is rejected even for a manager');
select is(tests.err('mgr', $$public.create_role('Bad scope', null, '[{"key":"staff.view","scope":"own"}]')$$), 'privilege_escalation', 'unsupported scope rejected');
select tests.as_user('mgr');
select tests.throws_ok($$select public.create_role('X', null, '[{"key":"staff.view","scope":"bogus"}]')$$, 'P0001', 'grants_invalid', 'malformed scope is grants_invalid');
select tests.throws_ok($$select public.create_role('X', null, '"nope"')$$, 'P0001', 'grants_invalid', 'non-array grants is grants_invalid');
select tests.throws_ok($$select public.create_role('   ', null, '[]')$$, 'P0001', 'role_name_invalid', 'blank name rejected');
select tests.reset();
select is(tests.rpc('mgr', $$public.create_role('Heavyx', null, '[{"key":"staff.disable"},{"key":"audit_logs.view","auditCategories":["staff"]}]')$$) ->> 'ok', 'true', 'manager creates any grantable role');
select tests.as_user('rst');
select tests.throws_ok($$select public.create_role('Nope', null, '[]')$$, '42501', null, 'staff without roles.create is not authorized');
select tests.reset();

-- self-edit (CL-027)
select is(tests.err('ed', format($$public.update_role(%L, 'Editor', 'd', '[{"key":"roles.view"}]')$$, (select editor from rl))), 'role_self_edit', 'a held role cannot be edited, even when reducing');
select is(tests.grants_of((select editor from rl)), 'roles.archive,roles.create,roles.update,roles.view', 'held role grants are unchanged');
select is(tests.err('ed', format($$public.update_role(%L, 'Renamed', null, '[{"key":"roles.create"},{"key":"roles.update"},{"key":"roles.archive"},{"key":"roles.view"}]')$$, (select editor from rl))), 'role_self_edit', 'held role cannot be renamed');
select is((select name from public.roles where id = (select editor from rl)), 'Editor', 'held role name unchanged');
select is(tests.n_sec('authz.role_self_edit_denied'), 2::bigint, 'each self-edit denial writes a security event');
select is(tests.rpc('mgr', format($$public.update_role(%L, 'Editor', null, '[{"key":"roles.view"}]')$$, (select editor from rl))) ->> 'ok', 'true', 'a different actor (manager) may edit the role');
select is(tests.rpc('mgr', format($$public.update_role(%L, 'Editor', null, '[{"key":"roles.create"},{"key":"roles.update"},{"key":"roles.archive"},{"key":"roles.view"}]')$$, (select editor from rl))) ->> 'ok', 'true', 'manager restores the editor grants');

-- update within / above the ceiling, removal needs the ceiling too
select is(tests.rpc('ed', format($$public.update_role(%L, 'Plain', null, '[{"key":"roles.view"},{"key":"roles.update"}]')$$, (select plain from rl))) ->> 'ok', 'true', 'delegate updates a role within the ceiling');
select is(tests.err('ed', format($$public.update_role(%L, 'Plain', null, '[{"key":"roles.view"},{"key":"staff.disable"}]')$$, (select plain from rl))), 'privilege_escalation', 'adding a grant above the ceiling is denied');
select is(tests.err('ed', format($$public.update_role(%L, 'Heavy', null, '[]')$$, (select heavy from rl))), 'privilege_escalation', 'removing a grant above the ceiling is denied');
select is(tests.grants_of((select heavy from rl)), 'staff.disable', 'denied update left the grants untouched');
select tests.as_user('ed');
select tests.throws_ok(format($$select public.update_role(%L, 'X', null, '[]')$$, (select foreign_role from rl)), 'P0001', 'role_not_found', 'cross-tenant role id is rejected');
select tests.throws_ok(format($$select public.archive_role(%L)$$, (select foreign_role from rl)), 'P0001', 'role_not_found', 'cross-tenant archive rejected');
select tests.reset();
select tests.as_user('rst');
select tests.throws_ok(format($$select public.update_role(%L, 'X', null, '[]')$$, (select plain from rl)), '42501', null, 'roles.restore alone cannot update');
select tests.reset();

-- archive (CL-028, CL-029)
select is(tests.err('ed', format($$public.archive_role(%L)$$, (select restorer from rl))), 'role_assigned', 'an assigned role cannot be archived');
select is((select count(*) from public.staff_roles where role_id = (select restorer from rl)), 1::bigint, 'the assignment was not removed');
select is(tests.err('mgr', format($$public.archive_role(%L)$$, (select offonly from rl))), 'role_assigned', 'a role held only by a disabled member cannot be archived');
select is(tests.rpc('ed', format($$public.archive_role(%L)$$, (select plain from rl))) ->> 'ok', 'true', 'a zero-assignment role archives');
select is((select archived_at is not null from public.roles where id = (select plain from rl)), true, 'role is archived');
select is((select count(*) from jsonb_array_elements(tests.rpc('mgr', 'public.list_roles()')) e where e ->> 'archivedAt' is not null), 1::bigint, 'list_roles marks the archived role');
select tests.throws_ok(format($$insert into public.staff_roles (tenant_id, staff_id, role_id) values (%L, %L, %L)$$, (select a from fx), (select staff_id from st where k = 'ed'), (select plain from rl)),
  'P0001', 'role_archived', 'an archived role cannot be assigned');
select is(tests.err('mgr', format($$public.set_staff_roles(%L, array[%L]::uuid[], '{}')$$, (select staff_id from st where k = 'rst'), (select plain from rl))), 'role_not_grantable', 'assignment RPC refuses an archived role');

-- restore (CL-030)
select tests.as_user('ed');
select tests.throws_ok(format($$select public.restore_role(%L)$$, (select plain from rl)), '42501', null, 'generic role management does not restore');
select tests.reset();
select is(tests.rpc('mgr', format($$public.archive_role(%L)$$, (select heavy from rl))) ->> 'ok', 'true', 'manager archives Heavy');
select is(tests.err('rst', format($$public.restore_role(%L)$$, (select heavy from rl))), 'privilege_escalation', 'roles.restore without the contained grant is denied');
select is((select archived_at is not null from public.roles where id = (select heavy from rl)), true, 'still archived after the denied restore');
create temp table light as select (tests.rpc('mgr', $$public.create_role('Light', null, '[{"key":"roles.view"}]')$$) ->> 'roleId')::uuid id;
select tests.rpc('mgr', format($$public.archive_role(%L)$$, (select id from light)));
select is(tests.rpc('rst', format($$public.restore_role(%L)$$, (select id from light))) ->> 'ok', 'true', 'roles.restore with a contained grant succeeds');
select is((select count(*) from public.staff_roles where role_id = (select id from light)), 0::bigint, 'no memberships return on restore');
select is(tests.rpc('mgr', format($$public.restore_role(%L)$$, (select heavy from rl))) ->> 'ok', 'true', 'a manager restores any role in their ceiling');

-- names (CL-031)
select is(tests.rpc('mgr', format($$public.archive_role(%L)$$, (select plain from rl))) ->> 'ok', 'true', 'archive Plain again');
select is(tests.rpc('mgr', $$public.create_role('plain', null, '[]')$$) ->> 'ok', 'true', 'an archived name is reusable by a new role (case-insensitive)');
select is(tests.err('mgr', $$public.create_role('PLAIN', null, '[]')$$), 'role_name_conflict', 'an active name cannot be duplicated');
select is(tests.err('mgr', format($$public.restore_role(%L)$$, (select plain from rl))), 'role_name_conflict', 'restore into an active-name conflict fails');
select is((select archived_at is not null from public.roles where id = (select plain from rl)), true, 'no partial change after the failed restore');
select is(tests.rpc('mgr', format($$public.update_role(%L, 'Plain (old)', null, '[{"key":"roles.view"}]')$$, (select plain from rl))) ->> 'ok', 'true', 'an archived role can be renamed');
select is(tests.rpc('mgr', format($$public.restore_role(%L)$$, (select plain from rl))) ->> 'ok', 'true', 'restore succeeds after the rename');

-- audit
select ok((select count(*) from public.tenant_audit_events where tenant_id = (select a from fx) and category = 'roles' and event in
  ('role.created','role.updated','role.archived','role.restored','role.update_denied','role.archive_denied','role.restore_denied','role.create_denied')) >= 12, 'every outcome is audited under roles');
select is((select count(*) from public.tenant_audit_events where tenant_id = (select a from fx) and metadata::text ~* 'password|token'), 0::bigint, 'audit holds no secrets');
