-- T136 staff administration (FR-008, FR-022, FR-023, FR-024, CL-044)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('stf-a') a, tests.mk_tenant('stf-b') b;
create temp table padm as select tests.mk_user('root@stf.test') uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via) select uid, '{tenants.managers.manage}', 'bootstrap' from padm;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'm1', s.*, null from tests.mk_staff((select a from fx), 'mone', 'm1@stf.test') s;
insert into st select 'm2', s.*, null from tests.mk_staff((select a from fx), 'mtwo', 'm2@stf.test') s;
insert into st select 'adm', s.*, null from tests.mk_staff((select a from fx), 'admin', 'adm@stf.test') s;   -- staff.roles.assign + disable + enable + view
insert into st select 'tgt', s.*, null from tests.mk_staff((select a from fx), 'target', 'tgt@stf.test') s;
insert into st select 'two', s.*, null from tests.mk_staff((select a from fx), 'second', 'two@stf.test') s;
insert into st select 'bst', s.*, null from tests.mk_staff((select b from fx), 'bstaff', 'b@stf.test') s;
insert into st select 'bmg', s.*, null from tests.mk_staff((select b from fx), 'bmanager', 'bm@stf.test') s;
update st set sid = tests.mk_session(user_id, case when k in ('bst','bmg') then (select b from fx) else (select a from fx) end, staff_id);
create temp table tgt_sess as select tests.mk_session(user_id, (select a from fx), staff_id) sid from st where k = 'tgt';
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select case when k = 'bmg' then (select b from fx) else (select a from fx) end, staff_id, (select uid from padm) from st where k in ('m1','m2','bmg');

create temp table rl as select tests.mk_role((select a from fx), 'Admins') admins, tests.mk_role((select a from fx), 'Viewer') viewer,
  tests.mk_role((select a from fx), 'Rolesonly') rolesonly, tests.mk_role((select a from fx), 'Powerful') powerful,
  tests.mk_role((select b from fx), 'BRole') brole;
insert into public.permission_grants (tenant_id, role_id, permission_key) values
  ((select a from fx), (select admins from rl), 'staff.roles.assign'), ((select a from fx), (select admins from rl), 'staff.disable'),
  ((select a from fx), (select admins from rl), 'staff.enable'), ((select a from fx), (select admins from rl), 'staff.view'),
  ((select a from fx), (select viewer from rl), 'staff.view'),
  ((select a from fx), (select rolesonly from rl), 'roles.view'),
  ((select a from fx), (select powerful from rl), 'roles.update'),
  ((select b from fx), (select brole from rl), 'staff.view');
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), staff_id, (select admins from rl) from st where k = 'adm'
  union all select (select a from fx), staff_id, (select viewer from rl) from st where k = 'two';

create function tests.rpc(p_who text, p_call text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform tests.claims((select user_id from st where k = p_who), (select sid from st where k = p_who));
  execute 'select ' || p_call into r;
  perform tests.reset();
  return r;
end $$;
create function tests.err(p_who text, p_call text) returns text language sql as $$ select tests.rpc(p_who, p_call) ->> 'error' $$;
create function tests.sid(p_k text) returns uuid language sql as $$ select staff_id from st where k = p_k $$;
create function tests.nroles(p_k text) returns bigint language sql as $$ select count(*) from public.staff_roles where staff_id = tests.sid(p_k) $$;

-- self membership (CL-044)
select is(tests.err('adm', format($$public.set_staff_roles(%L, array[%L]::uuid[], '{}')$$, tests.sid('adm'), (select viewer from rl))), 'cannot_change_own_roles', 'self add is denied');
select is(tests.err('adm', format($$public.set_staff_roles(%L, '{}', array[%L]::uuid[])$$, tests.sid('adm'), (select admins from rl))), 'cannot_change_own_roles', 'self remove (reducing) is denied');
select is(tests.err('adm', format($$public.set_staff_roles(%L, array[%L]::uuid[], array[%L]::uuid[])$$, tests.sid('adm'), (select viewer from rl), (select admins from rl))), 'cannot_change_own_roles', 'self swap is denied');
select is(tests.err('m1', format($$public.set_staff_roles(%L, array[%L,%L]::uuid[], '{}')$$, tests.sid('m1'), (select viewer from rl), (select rolesonly from rl))), 'cannot_change_own_roles', 'self bulk is denied, even for a manager');
select is(tests.nroles('adm'), 1::bigint, 'own memberships unchanged');
select is((select count(*) from public.tenant_security_events where tenant_id = (select a from fx) and event = 'authz.self_membership_denied'), 4::bigint, 'each attempt writes a security event');

-- another authorized actor, within the ceiling
select is(tests.rpc('adm', format($$public.set_staff_roles(%L, array[%L]::uuid[], '{}')$$, tests.sid('tgt'), (select viewer from rl))) ->> 'ok', 'true', 'delegate adds a role within the ceiling');
select is(tests.err('adm', format($$public.set_staff_roles(%L, array[%L]::uuid[], '{}')$$, tests.sid('tgt'), (select powerful from rl))), 'role_not_grantable', 'delegate cannot add a role above the ceiling');
select is(tests.err('adm', format($$public.set_staff_roles(%L, array[%L]::uuid[], '{}')$$, tests.sid('tgt'), (select brole from rl))), 'role_not_grantable', 'a role of another tenant is refused');
select is(tests.rpc('m1', format($$public.set_staff_roles(%L, array[%L]::uuid[], '{}')$$, tests.sid('tgt'), (select powerful from rl))) ->> 'ok', 'true', 'manager adds any role');
select is(tests.err('adm', format($$public.set_staff_roles(%L, '{}', array[%L]::uuid[])$$, tests.sid('tgt'), (select powerful from rl))), 'role_not_grantable', 'removal is also bound by the ceiling');
select is(tests.rpc('adm', format($$public.set_staff_roles(%L, '{}', array[%L]::uuid[])$$, tests.sid('tgt'), (select viewer from rl))) ->> 'ok', 'true', 'delegate removes a role within the ceiling');
select is(tests.nroles('tgt'), 1::bigint, 'target keeps the role the delegate could not touch');
select tests.claims((select user_id from st where k = 'adm'), (select sid from st where k = 'adm'));
select tests.throws_ok(format($$select public.set_staff_roles(%L, '{}', '{}')$$, tests.sid('bst')), 'P0001', 'staff_not_found', 'cross-tenant target is rejected');
select tests.reset();
select tests.claims((select user_id from st where k = 'two'), (select sid from st where k = 'two'));
select tests.throws_ok(format($$select public.set_staff_roles(%L, '{}', '{}')$$, tests.sid('tgt')), '42501', null, 'no staff.roles.assign means not authorized');
select tests.throws_ok(format($$select public.disable_staff(%L)$$, tests.sid('tgt')), '42501', null, 'no staff.disable means not authorized');
select tests.reset();

-- disable / enable
select is(tests.err('adm', format($$public.disable_staff(%L)$$, tests.sid('adm'))), 'cannot_disable_self', 'disabling oneself is denied');
select tests.claims((select user_id from st where k = 'adm'), (select sid from st where k = 'adm'));
select tests.throws_ok(format($$select public.disable_staff(%L)$$, tests.sid('bst')), 'P0001', 'staff_not_found', 'disable cannot reach another tenant');
select tests.throws_ok(format($$select public.enable_staff(%L)$$, tests.sid('bst')), 'P0001', 'staff_not_found', 'enable cannot reach another tenant');
select tests.reset();
select is(tests.rpc('adm', format($$public.disable_staff(%L)$$, tests.sid('tgt'))) ->> 'ok', 'true', 'delegate disables staff');
select is((select enabled from public.tenant_staff where id = tests.sid('tgt')), false, 'staff is disabled');
select is((select count(*) from public.session_registry where staff_id = tests.sid('tgt') and revoked_at is null), 0::bigint, 'disable revoked every registry session');
select is(tests.err('adm', format($$public.disable_staff(%L)$$, tests.sid('m2'))), 'manager_protected', 'a delegate cannot disable a manager');
select is(tests.rpc('adm', format($$public.enable_staff(%L)$$, tests.sid('tgt'))) ->> 'ok', 'true', 'delegate enables staff');
select is((select enabled from public.tenant_staff where id = tests.sid('tgt')), true, 'staff is enabled again');
-- last active manager
select is(tests.rpc('m1', format($$public.disable_staff(%L)$$, tests.sid('m2'))) ->> 'ok', 'true', 'a manager disables another manager while one remains');
select is(tests.err('m1', format($$public.disable_staff(%L)$$, tests.sid('m1'))), 'cannot_disable_self', 'the last manager cannot disable themselves');
select is((select count(*) from public.tenant_manager_grants g join public.tenant_staff s on s.id = g.staff_id where g.tenant_id = (select a from fx) and g.revoked_at is null and s.enabled), 1::bigint, 'one active manager remains');
select is(tests.rpc('m1', format($$public.enable_staff(%L)$$, tests.sid('m2'))) ->> 'ok', 'true', 'manager re-enables the other manager');

-- no RPC edits email or username
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  and p.proname ~ '(update|change|set).*email'), 0::bigint, 'no public RPC edits email');
select tests.throws_ok(format($$update public.tenant_staff set email = 'x@y.test', email_normalized = 'x@y.test' where id = %L$$, tests.sid('tgt')), 'P0001', 'staff_identity_immutable', 'email is immutable at the table');

-- list/get, multi-role union
select tests.rpc('m1', format($$public.set_staff_roles(%L, array[%L,%L]::uuid[], '{}')$$, tests.sid('tgt'), (select viewer from rl), (select rolesonly from rl)));
select is(jsonb_array_length(tests.rpc('m1', 'public.get_staff(' || quote_literal(tests.sid('tgt')) || ')') -> 'roles'), 3, 'get_staff lists the roles');
select is(jsonb_array_length(tests.rpc('m1', 'public.list_staff()')), 5, 'list_staff only lists the tenant');
update st set sid = tests.mk_session(user_id, (select a from fx), staff_id) where k = 'tgt';
select tests.claims((select user_id from st where k = 'tgt'), (select sid from st where k = 'tgt'));
select is(private.has_permission('staff.view'), true, 'union: key from the first role');
select is(private.has_permission('roles.view'), true, 'union: key from the second role');
select is(private.has_permission('roles.update'), true, 'union: key from the third role');
select is(private.has_permission('staff.invite'), false, 'union does not invent keys');
select tests.reset();
