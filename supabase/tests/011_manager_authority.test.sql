-- T074 manager authority (FR-008, FR-026, CL-023..CL-026, SC-005)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('mgr-a') a, tests.mk_tenant('mgr-b') b;
create temp table pa as select tests.mk_user('root@mgr.test') uid, tests.mk_user('nomgr@mgr.test') nocap_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage,tenants.managers.manage}'::text[], 'bootstrap' from pa
  union all select nocap_uid, '{tenants.manage}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select nocap_uid from pa)) nocap_sid;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'm1', s.*, null from tests.mk_staff((select a from fx), 'mone', 'm1@mgr.test') s;
insert into st select 'm2', s.*, null from tests.mk_staff((select a from fx), 'mtwo', 'm2@mgr.test') s;
insert into st select 'ord', s.*, null from tests.mk_staff((select a from fx), 'ordinary', 'ord@mgr.test') s;
insert into st select 'off', s.*, null from tests.mk_staff((select a from fx), 'offstaff', 'off@mgr.test', false) s;
insert into st select 'bst', s.*, null from tests.mk_staff((select b from fx), 'bstaff', 'b@mgr.test') s;
update st set sid = tests.mk_session(user_id, case when k = 'bst' then (select b from fx) else (select a from fx) end, staff_id);
create temp table extra_sid as select tests.mk_session(user_id, (select a from fx), staff_id) sid from st where k = 'm2';
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select a from fx), staff_id, (select uid from pa) from st where k = 'm1';
insert into public.roles (tenant_id, name) values ((select a from fx), 'Keep');
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), s.staff_id, r.id from st s, public.roles r where s.k = 'm2' and r.name = 'Keep' and r.tenant_id = (select a from fx);

-- authorization of grant / revoke
select tests.claims((select user_id from st where k='m1'), (select sid from st where k='m1'));
select tests.throws_ok(format($$select public.platform_grant_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='ord')),
  '42501', null, 'tenant manager cannot grant manager authority');
select tests.throws_ok(format($$select public.platform_revoke_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='m1')),
  '42501', null, 'tenant manager cannot revoke manager authority');
select tests.reset();
create temp table direct_sql as select format($$insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin) values (%L, %L, %L)$$,
  (select a from fx), (select staff_id from st where k='ord'), (select uid from pa)) q;
grant select on direct_sql to public;
select tests.act_as((select user_id from st where k='m1'), (select sid from st where k='m1'));
select tests.throws_ok((select q from direct_sql), '42501', null, 'no direct table write for authenticated');
select tests.reset();
select tests.claims((select nocap_uid from pa), (select nocap_sid from ps));
select tests.throws_ok(format($$select public.platform_grant_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='ord')),
  '42501', null, 'tenants.managers.manage is required (grant)');
select tests.throws_ok(format($$select public.platform_invite_tenant_manager(%L, 'new@mgr.test', repeat('e',64))$$, (select a from fx)),
  '42501', null, 'tenants.managers.manage is required (invite)');
select tests.reset();

-- grant
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_grant_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='m2')), 'platform admin promotes existing staff');
select tests.throws_ok(format($$select public.platform_grant_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='bst')),
  'P0001', 'staff_not_found', 'cannot promote staff of another tenant');
select tests.throws_ok(format($$select public.platform_grant_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='off')),
  'P0001', 'staff_not_eligible', 'cannot promote a disabled account');
select tests.throws_ok(format($$select public.platform_grant_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='m2')),
  'P0001', 'already_manager', 'double promotion rejected');
select tests.reset();
select is((select count(*)::int from public.tenant_manager_grants where tenant_id = (select a from fx) and revoked_at is null), 2, 'two active managers');
select is((select count(*)::int from public.platform_audit_events where event = 'manager.granted'), 1, 'grant in platform audit');
select is((select count(*)::int from public.tenant_audit_events where tenant_id = (select a from fx) and event = 'manager.granted'), 1, 'grant in tenant audit');

-- invitation of a manager
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_invite_tenant_manager(%L, 'invited@mgr.test', repeat('f',64))$$, (select a from fx)), 'manager invitation issued');
select tests.reset();
select is((select count(*)::int from public.staff_invitations where tenant_id = (select a from fx) and grants_manager and state = 'pending'), 1, 'pending manager invitation exists');

-- revoke m1 (keeps m2): demotion semantics
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_revoke_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='m2')), 'demote m2 while m1 remains');
select tests.reset();
select is((select enabled from public.tenant_staff where id = (select staff_id from st where k='m2')), true, 'demotion keeps the account enabled');
select is((select count(*)::int from public.staff_roles where staff_id = (select staff_id from st where k='m2')), 1, 'demotion keeps non-manager roles');
select is((select count(*)::int from public.session_registry where auth_user_id = (select user_id from st where k='m2') and revoked_at is null), 0, 'ALL of the demoted user''s registry sessions are revoked');
select is((select count(*)::int from public.session_registry where auth_user_id = (select user_id from st where k='m2') and revoked_reason = 'manager_demoted'), 2, 'revocation reason is manager_demoted');
select is((select count(*)::int from auth.sessions where user_id = (select user_id from st where k='m2')), 0, 'provider sessions deleted too');
select tests.claims((select user_id from st where k='m2'), (select sid from st where k='m2'));
select is(private.is_active_tenant_manager(), false, 'demoted user has no manager authority');
select tests.reset();
select is((select count(*)::int from public.platform_audit_events where event = 'manager.revoked'), 1, 'revocation in platform audit');
select is((select count(*)::int from public.tenant_audit_events where tenant_id = (select a from fx) and event = 'manager.revoked'), 1, 'revocation in tenant audit');

-- last-manager invariant (a pending invitation does not count)
select tests.claims((select uid from pa), (select sid from ps));
select tests.throws_ok(format($$select public.platform_revoke_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='m1')),
  'P0001', 'last_active_manager', 'cannot revoke the last active manager, even with a pending manager invitation');
select tests.throws_ok(format($$select public.platform_revoke_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='ord')),
  'P0001', 'not_a_manager', 'revoking a non-manager is rejected');
select tests.reset();
select is((select count(*)::int from public.tenant_manager_grants where tenant_id = (select a from fx) and revoked_at is null), 1, 'one active manager remains');

-- a disabled manager does not count as an active manager
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_grant_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='ord')), 'promote ord');
select tests.reset();
update public.tenant_staff set enabled = false where id = (select staff_id from st where k='m1');
select tests.claims((select uid from pa), (select sid from ps));
select tests.throws_ok(format($$select public.platform_revoke_tenant_manager(%L, %L)$$, (select a from fx), (select staff_id from st where k='ord')),
  'P0001', 'last_active_manager', 'a disabled manager does not satisfy the invariant');
select tests.reset();
