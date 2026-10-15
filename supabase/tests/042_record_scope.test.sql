-- T137 record-scope helper (FR-028, US4 scenario 6). A temporary fixture table only: no business schema is added.
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('scp-a') a, tests.mk_tenant('scp-b') b;
create temp table padm as select tests.mk_user('root@scp.test') uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via) select uid, '{tenants.managers.manage}', 'bootstrap' from padm;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'all', s.*, null from tests.mk_staff((select a from fx), 'allone', 'all@scp.test') s;
insert into st select 'own', s.*, null from tests.mk_staff((select a from fx), 'ownone', 'own@scp.test') s;
insert into st select 'asg', s.*, null from tests.mk_staff((select a from fx), 'asgone', 'asg@scp.test') s;
insert into st select 'mgr', s.*, null from tests.mk_staff((select a from fx), 'mgrone', 'mgr@scp.test') s;
insert into st select 'bst', s.*, null from tests.mk_staff((select b from fx), 'bstaff', 'b@scp.test') s;
update st set sid = tests.mk_session(user_id, case when k = 'bst' then (select b from fx) else (select a from fx) end, staff_id);
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select a from fx), staff_id, (select uid from padm) from st where k = 'mgr';

-- a test-only catalog key that supports every scope (the real catalog supports only `all` today)
insert into public.permission_catalog (key, resource, action, supports_scopes, tenant_grantable, description)
  values ('test.records', 'test', 'records', '{all,own,assigned}', true, 'test only');
create temp table rl as select tests.mk_role((select a from fx), 'R-all') r_all, tests.mk_role((select a from fx), 'R-own') r_own,
  tests.mk_role((select a from fx), 'R-asg') r_asg, tests.mk_role((select b from fx), 'R-b') r_b;
insert into public.permission_grants (tenant_id, role_id, permission_key, scope) values
  ((select a from fx), (select r_all from rl), 'test.records', 'all'), ((select a from fx), (select r_own from rl), 'test.records', 'own'),
  ((select a from fx), (select r_asg from rl), 'test.records', 'assigned'), ((select b from fx), (select r_b from rl), 'test.records', 'all');
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), staff_id, (select r_all from rl) from st where k = 'all'
  union all select (select a from fx), staff_id, (select r_own from rl) from st where k = 'own'
  union all select (select a from fx), staff_id, (select r_asg from rl) from st where k = 'asg'
  union all select (select b from fx), staff_id, (select r_b from rl) from st where k = 'bst';

-- fixture records
create temp table recs (id int primary key, tenant_id uuid, owner_staff_id uuid, assignee_staff_ids uuid[]);
insert into recs select 1, (select a from fx), (select staff_id from st where k = 'own'), '{}';                              -- owned by `own`
insert into recs select 2, (select a from fx), (select staff_id from st where k = 'all'), array[(select staff_id from st where k = 'asg')]; -- assigned to `asg`
insert into recs select 3, (select a from fx), (select staff_id from st where k = 'all'), '{}';                              -- neither
insert into recs select 4, (select b from fx), (select staff_id from st where k = 'bst'), array[(select staff_id from st where k = 'bst')]; -- tenant B

create function tests.sees(p_who text, p_rec int) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform tests.claims((select user_id from st where k = p_who), (select sid from st where k = p_who));
  select private.has_permission_for_record('test.records', x.tenant_id, x.owner_staff_id, x.assignee_staff_ids) into r from recs x where x.id = p_rec;
  perform tests.reset();
  return r;
end $$;

select is(tests.sees('all', 1), true, 'all-scope reaches a record owned by someone else');
select is(tests.sees('all', 3), true, 'all-scope reaches an unowned, unassigned record');
select is(tests.sees('own', 1), true, 'own-scope reaches a record they own');
select is(tests.sees('own', 2), false, 'own-scope does not reach others'' records');
select is(tests.sees('own', 3), false, 'own does not imply all');
select is(tests.sees('asg', 2), true, 'assigned-scope reaches a record they are assigned to');
select is(tests.sees('asg', 1), false, 'assigned-scope does not reach an unrelated record');
select is(tests.sees('asg', 3), false, 'assigned does not imply all');
select is(tests.sees('mgr', 3), true, 'an active manager implicitly holds every tenant-grantable key with scope all');
select is(tests.sees('all', 4), false, 'tenant isolation: all-scope never crosses tenants');
select is(tests.sees('bst', 1), false, 'tenant isolation: another tenant''s user cannot reach this tenant');
select is(tests.sees('bst', 4), true, 'tenant B reaches its own record');
select is(tests.sees('own', 4), false, 'tenant A own-scope cannot reach tenant B');
