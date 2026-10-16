-- T167 audit access (FR-031, FR-033, CL-032, CL-035, SC-006)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('aud-a') a, tests.mk_tenant('aud-b') b;
create temp table pa as select tests.mk_user('noaudit@aud.test') uid, tests.mk_user('auditor@aud.test') aud_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage,tenants.managers.manage}'::text[], 'bootstrap' from pa
  union all select aud_uid, '{platform_audit.view}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select aud_uid from pa)) aud_sid;

create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'mgr', s.*, null from tests.mk_staff((select a from fx), 'amgr', 'mgr@aud.test') s;
insert into st select 'del', s.*, null from tests.mk_staff((select a from fx), 'adel', 'del@aud.test') s;
insert into st select 'emp', s.*, null from tests.mk_staff((select a from fx), 'aemp', 'emp@aud.test') s;
insert into st select 'arch', s.*, null from tests.mk_staff((select a from fx), 'aarch', 'arch@aud.test') s;
insert into st select 'dmgr', s.*, null from tests.mk_staff((select a from fx), 'admgr', 'dmgr@aud.test') s;
insert into st select 'bmgr', s.*, null from tests.mk_staff((select b from fx), 'bmgr', 'bmgr@aud.test') s;
update st set sid = tests.mk_session(user_id, case when k = 'bmgr' then (select b from fx) else (select a from fx) end, staff_id);
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin, revoked_at, revoked_by_platform_admin)
  select case when k = 'bmgr' then (select b from fx) else (select a from fx) end, staff_id, (select uid from pa),
         case when k = 'dmgr' then now() end, case when k = 'dmgr' then (select uid from pa) end
  from st where k in ('mgr', 'bmgr', 'dmgr');

-- the delegate holds audit_logs.view for staff + roles; `arch` holds every category through an ARCHIVED role only
create temp table rl as select tests.mk_role((select a from fx), 'Auditors') aud, tests.mk_role((select a from fx), 'Old auditors') old_aud;
insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values
  ((select a from fx), (select aud from rl), 'audit_logs.view', '{staff,roles}'),
  ((select a from fx), (select old_aud from rl), 'audit_logs.view', '{staff,invitations,roles,tenant_settings,sessions}');
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), staff_id, (select aud from rl) from st where k = 'del'
  union all select (select a from fx), staff_id, (select old_aud from rl) from st where k = 'arch';
update public.roles set archived_at = now() where id = (select old_aud from rl);

-- events: A has two staff events (by the delegate and the manager), one of every other category; B has one staff event
create temp table ev (k text primary key, id bigint);
insert into ev select 'a_staff_del', private.write_tenant_audit((select a from fx), 'staff', (select staff_id from st where k = 'del'), null, 'staff', 'staff.disabled', 'tenant_staff', 'x1', '{"n":1}');
insert into ev select 'a_staff_mgr', private.write_tenant_audit((select a from fx), 'staff', (select staff_id from st where k = 'mgr'), null, 'staff', 'staff.enabled', 'tenant_staff', 'x2');
insert into ev select 'a_inv', private.write_tenant_audit((select a from fx), 'staff', (select staff_id from st where k = 'mgr'), null, 'invitations', 'invitation.issued', 'staff_invitation', 'i1');
insert into ev select 'a_roles', private.write_tenant_audit((select a from fx), 'staff', (select staff_id from st where k = 'mgr'), null, 'roles', 'role.created', 'role', 'r1');
insert into ev select 'a_settings', private.write_tenant_audit((select a from fx), 'platform_admin', null, (select uid from pa), 'tenant_settings', 'tenant.name_updated', 'tenant', 't1');
insert into ev select 'a_sessions', private.write_tenant_audit((select a from fx), 'staff', (select staff_id from st where k = 'emp'), null, 'sessions', 'session.revoked', 'session_registry', 's1');
insert into ev select 'b_staff', private.write_tenant_audit((select b from fx), 'staff', (select staff_id from st where k = 'bmgr'), null, 'staff', 'staff.disabled', 'tenant_staff', 'x3');
insert into ev select 'a_sec', private.write_security_event((select a from fx), (select staff_id from st where k = 'emp'), 'authz.denied', '{"reason":"manager_only"}');
insert into ev select 'b_sec', private.write_security_event((select b from fx), null, 'auth.sign_in_failed', '{"reason":"invalid"}');
insert into ev select 'plat', private.write_platform_audit((select uid from pa), null, 'tenant.name_updated', jsonb_build_object('tenantId', (select a from fx)));

create function tests.call(p_who text, p_call text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  if p_who = 'padm' then perform tests.claims((select uid from pa), (select sid from ps));
  elsif p_who = 'pauditor' then perform tests.claims((select aud_uid from pa), (select aud_sid from ps));
  else perform tests.claims((select user_id from st where k = p_who), (select sid from st where k = p_who));
  end if;
  execute 'select ' || p_call into r;
  perform tests.reset();
  return r;
exception when others then
  perform tests.reset();
  raise;
end $$;
create function tests.err(p_who text, p_call text) returns text language plpgsql as $$
begin
  perform tests.call(p_who, p_call);
  return 'no error';
exception when others then
  return sqlstate || ':' || sqlerrm;
end $$;
create function tests.cats(p_rows jsonb) returns text language sql as
  $$ select coalesce(string_agg(distinct e ->> 'category', ',' order by e ->> 'category'), '') from jsonb_array_elements(p_rows) e $$;
create function tests.ids(p_rows jsonb) returns bigint[] language sql as
  $$ select coalesce(array_agg((e ->> 'id')::bigint order by (e ->> 'id')::bigint), '{}') from jsonb_array_elements(p_rows) e $$;
create function tests.ev(p_k text) returns bigint language sql as $$ select id from ev where k = p_k $$;

-- delegate: category-limited rows, counts, details, search, pagination and export (CL-032)
create temp table r_del as select tests.call('del', 'public.list_tenant_audit()') r;
select is(tests.cats((select r -> 'rows' from r_del)), 'roles,staff', 'delegate list holds only the granted categories');
select is((select (r ->> 'totalCount')::int from r_del), 3, 'delegate total_count counts only granted categories of their tenant');
select is((select r -> 'categories' from r_del), '["roles", "staff"]'::jsonb, 'the RPC reports the categories the viewer may filter by');
select ok(not (tests.ev('b_staff') = any (tests.ids((select r -> 'rows' from r_del)))), 'another tenant''s event never appears');
select is(tests.call('del', $$public.list_tenant_audit(p_categories => '{tenant_settings}')$$) ->> 'totalCount', '0', 'asking for an ungranted category returns nothing');
select is(tests.cats(tests.call('del', $$public.list_tenant_audit(p_categories => '{staff,tenant_settings,sessions}')$$) -> 'rows'), 'staff', 'a mixed request is intersected with the granted categories');
select is(tests.call('del', $$public.list_tenant_audit(p_search => 'tenant')$$) ->> 'totalCount', '0', 'search cannot reach an ungranted category');
select is(tests.call('del', $$public.list_tenant_audit(p_search => 'disabled')$$) ->> 'totalCount', '1', 'search matches within granted categories');
select is(tests.call('del', format($$public.list_tenant_audit(p_actor => %L)$$, (select staff_id from st where k = 'del'))) ->> 'totalCount', '1', 'actor filter');
select is(tests.call('del', format($$public.list_tenant_audit(p_from => %L)$$, now() + interval '1 second')) ->> 'totalCount', '0', 'date range: from');
select is(tests.call('del', format($$public.list_tenant_audit(p_to => %L)$$, now() - interval '1 second')) ->> 'totalCount', '0', 'date range: to');
select is(tests.call('del', format($$public.list_tenant_audit(p_from => %L, p_to => %L)$$, now(), now())) ->> 'totalCount', '3', 'date range bounds are inclusive');
select is(jsonb_array_length(tests.call('del', 'public.list_tenant_audit(p_limit => 1)') -> 'rows'), 1, 'page size is honoured');
select is(tests.call('del', 'public.list_tenant_audit(p_limit => 1, p_offset => 2)') ->> 'totalCount', '3', 'total_count is independent of the page');
select ok((tests.call('del', 'public.list_tenant_audit(p_limit => 1, p_offset => 0)') -> 'rows' -> 0 ->> 'id')
       <> (tests.call('del', 'public.list_tenant_audit(p_limit => 1, p_offset => 1)') -> 'rows' -> 0 ->> 'id'), 'pages do not overlap');
select is(jsonb_array_length(tests.call('del', 'public.list_tenant_audit(p_offset => 3)') -> 'rows'), 0, 'paging past the end returns no rows');
select is(tests.call('del', format('public.get_tenant_audit_event(%s)', tests.ev('a_staff_del'))) ->> 'event', 'staff.disabled', 'delegate fetches the detail of a granted event');
select is(tests.err('del', format('public.get_tenant_audit_event(%s)', tests.ev('a_settings'))), 'P0001:event_not_found', 'detail of an ungranted category is not found');
select is(tests.err('del', format('public.get_tenant_audit_event(%s)', tests.ev('b_staff'))), 'P0001:event_not_found', 'detail of another tenant''s event is not found');
select is(tests.err('del', format('public.get_tenant_audit_event(%s)', tests.ev('a_sec'))), 'P0001:event_not_found', 'a security event id is not an audit event');
create temp table x_del as select tests.call('del', 'public.export_tenant_audit()') r;
select is(tests.cats((select r -> 'rows' from x_del)), 'roles,staff', 'export obeys the granted categories');
select is(jsonb_array_length((select r -> 'rows' from x_del)), 3, 'export holds every granted row');
select is(jsonb_array_length(tests.call('del', $$public.export_tenant_audit(p_categories => '{roles}')$$) -> 'rows'), 1, 'export obeys the category filter');
select is((select count(*)::int from public.tenant_audit_events where tenant_id = (select a from fx) and event = 'audit.exported'
           and actor_staff_id = (select staff_id from st where k = 'del')), 2, 'every export is audited');
select is((select category from public.tenant_audit_events where tenant_id = (select a from fx) and event = 'audit.exported' limit 1), 'tenant_settings', 'exports are recorded as tenant settings events');
select ok(not exists (select 1 from jsonb_array_elements((select r -> 'rows' from r_del)) e where e -> 'actor' ? 'email'), 'rows expose no actor email');
select is((select r -> 'rows' from r_del) -> 0 -> 'metadata' ? 'password', false, 'metadata is the sanitized copy');

-- manager: every tenant administrative category of their own tenant, still no security events
create temp table r_mgr as select tests.call('mgr', 'public.list_tenant_audit()') r;
select is(tests.cats((select r -> 'rows' from r_mgr)), 'invitations,roles,sessions,staff,tenant_settings', 'manager sees every administrative category');
select is((select (r ->> 'totalCount')::int from r_mgr), 8, 'manager count: six seeded events plus the two exports');
select ok(not (tests.ev('b_staff') = any (tests.ids((select r -> 'rows' from r_mgr)))), 'manager never sees another tenant');
select is((select r -> 'rows' from r_mgr) -> 0 ->> 'event', 'audit.exported', 'newest first');
select is(tests.call('mgr', format('public.get_tenant_audit_event(%s)', tests.ev('a_settings'))) ->> 'actorKind', 'platform_admin', 'platform-originated tenant events are visible');
select is(tests.call('mgr', format('public.get_tenant_audit_event(%s)', tests.ev('a_settings'))) -> 'actor', 'null'::jsonb, 'a platform actor is never identified to the tenant');
select is(tests.err('mgr', format('public.get_tenant_audit_event(%s)', tests.ev('b_staff'))), 'P0001:event_not_found', 'manager cannot fetch another tenant''s event');

-- no audit_logs.view: denied everywhere; an archived role grants nothing; categories can never be null or empty
select is(tests.err('emp', 'public.list_tenant_audit()'), '42501:not_authorized', 'staff without audit_logs.view are denied the list');
select is(tests.err('emp', format('public.get_tenant_audit_event(%s)', tests.ev('a_sessions'))), '42501:not_authorized', 'and the detail of their own event');
select is(tests.err('emp', 'public.export_tenant_audit()'), '42501:not_authorized', 'and the export');
select is(tests.err('arch', 'public.list_tenant_audit()'), '42501:not_authorized', 'audit_logs.view held only through an archived role grants nothing');
select tests.throws_ok(format($$insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values (%L, %L, 'audit_logs.view', null)$$,
  (select a from fx), (select tests.mk_role((select a from fx), 'Null cats'))), '23514', null, 'audit_logs.view with null categories cannot exist');
select tests.throws_ok(format($$insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values (%L, %L, 'audit_logs.view', '{}')$$,
  (select a from fx), (select tests.mk_role((select a from fx), 'Empty cats'))), '23514', null, 'audit_logs.view with empty categories cannot exist');
select tests.throws_ok(format($$insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values (%L, %L, 'audit_logs.view', '{tenant_lifecycle}')$$,
  (select a from fx), (select tests.mk_role((select a from fx), 'Bad cats'))), '23514', null, 'an unapproved category cannot be granted');

-- Security Logs: active manager of the tenant only (CL-035)
create temp table s_mgr as select tests.call('mgr', 'public.list_security_events()') r;
select is((select (r ->> 'totalCount')::int from s_mgr), 1, 'manager sees their tenant''s security events');
select is(tests.ids((select r -> 'rows' from s_mgr)), array[tests.ev('a_sec')], 'and only those');
select is(tests.call('mgr', format('public.get_security_event(%s)', tests.ev('a_sec'))) ->> 'event', 'authz.denied', 'manager fetches a security event detail');
select is(tests.err('mgr', format('public.get_security_event(%s)', tests.ev('b_sec'))), 'P0001:event_not_found', 'not another tenant''s');
select is(jsonb_array_length(tests.call('mgr', 'public.export_security_events()') -> 'rows'), 1, 'manager exports the Security Log');
select is((select count(*)::int from public.tenant_audit_events where tenant_id = (select a from fx) and event = 'audit.exported'
           and metadata ->> 'log' = 'security'), 1, 'a Security Log export is audited');
select is(tests.call('mgr', $$public.list_security_events(p_event => 'auth.sign_in_failed')$$) ->> 'totalCount', '0', 'event filter');
select is(tests.err('del', 'public.list_security_events()'), '42501:not_authorized', 'a delegate holding audit_logs.view is denied the Security Log');
select is(tests.err('del', format('public.get_security_event(%s)', tests.ev('a_sec'))), '42501:not_authorized', 'and its details');
select is(tests.err('del', 'public.export_security_events()'), '42501:not_authorized', 'and its export');
select is(tests.err('emp', 'public.list_security_events()'), '42501:not_authorized', 'ordinary staff are denied the Security Log');
select is(tests.err('dmgr', 'public.list_security_events()'), '42501:not_authorized', 'a demoted manager is denied the Security Log');
select is(tests.ids(tests.call('bmgr', 'public.list_security_events()') -> 'rows'), array[tests.ev('b_sec')], 'another tenant''s manager sees only their own tenant');
select is(tests.err('bmgr', format('public.get_security_event(%s)', tests.ev('a_sec'))), 'P0001:event_not_found', 'another tenant''s manager cannot fetch A''s event');
select tests.throws_ok(format($$insert into public.permission_grants (tenant_id, role_id, permission_key) values (%L, %L, 'security_logs.view')$$,
  (select a from fx), (select aud from rl)), 'P0001', 'permission_not_grantable', 'Security Log access can never be granted through a role');

-- platform: no tenant audit for platform admins; platform audit needs platform_audit.view
select is(tests.err('padm', 'public.list_tenant_audit()'), '42501:not_authorized', 'a platform admin cannot read tenant audit');
select is(tests.err('padm', 'public.list_security_events()'), '42501:not_authorized', 'a platform admin cannot read tenant Security Logs');
select is(tests.err('pauditor', 'public.list_tenant_audit()'), '42501:not_authorized', 'platform_audit.view does not open tenant audit');
select is(tests.err('padm', 'public.platform_list_audit()'), '42501:not_authorized', 'platform audit needs platform_audit.view');
select is(tests.err('mgr', 'public.platform_list_audit()'), '42501:not_authorized', 'a tenant manager cannot read platform audit');
create temp table p_aud as select tests.call('pauditor', $$public.platform_list_audit(p_limit => 100)$$) r;
select ok(tests.ev('plat') = any (tests.ids((select r -> 'rows' from p_aud))), 'platform auditor sees platform events');
select is(tests.call('pauditor', $$public.platform_list_audit(p_event => 'staff.disabled')$$) ->> 'totalCount', '0', 'tenant audit events never appear in the platform log');
select is((tests.call('pauditor', $$public.platform_list_audit(p_event => 'auth.sign_in_failed')$$) ->> 'totalCount')::bigint,
  (select count(*) from public.platform_audit_events where event = 'auth.sign_in_failed'), 'tenant security events never appear in the platform log');
select ok(not exists (select 1 from jsonb_array_elements((select r -> 'rows' from p_aud)) e where e ? 'category' or e ? 'resourceId'), 'platform rows carry no tenant audit fields');
select is(tests.call('pauditor', format($$public.platform_list_audit(p_event => 'tenant.name_updated', p_search => %L)$$, (select a from fx))) ->> 'totalCount', '1', 'platform event and search filters');

-- privileges: none of the readers is reachable anonymously; the security writer only accepts approved event types
select ok(not has_function_privilege('anon', 'public.list_tenant_audit(text[], timestamptz, timestamptz, uuid, text, integer, integer)', 'execute'), 'anon cannot call list_tenant_audit');
select ok(not has_function_privilege('anon', 'public.list_security_events(timestamptz, timestamptz, text, text, integer, integer)', 'execute'), 'anon cannot call list_security_events');
select ok(not has_function_privilege('anon', 'public.platform_list_audit(timestamptz, timestamptz, text, text, integer, integer)', 'execute'), 'anon cannot call platform_list_audit');
select tests.throws_ok(format($$select private.write_security_event(%L, null, 'login.failed')$$, (select a from fx)), '23514', null, 'an unapproved security event type is rejected');

-- stale authorization: losing the role mid-session closes every reader at once
delete from public.staff_roles where staff_id = (select staff_id from st where k = 'del');
select is(tests.err('del', 'public.list_tenant_audit()'), '42501:not_authorized', 'a delegate whose role was removed is denied the list');
select is(tests.err('del', 'public.export_tenant_audit()'), '42501:not_authorized', 'and the export');
select is(tests.err('del', format('public.get_tenant_audit_event(%s)', tests.ev('a_staff_del'))), '42501:not_authorized', 'and the detail');

-- reads are not audited (FR-032): only the three exports above were written by this test
select is((select count(*)::int from public.tenant_audit_events where tenant_id = (select a from fx) and id > tests.ev('a_sessions') and event <> 'audit.exported'), 0,
  'list and detail reads write no audit events');
