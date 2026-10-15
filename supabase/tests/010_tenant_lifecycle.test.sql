-- T073 tenant lifecycle RPCs (FR-002..FR-007, SC-002)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('life-b') b;
create temp table pa as select tests.mk_user('root@life.test') uid, tests.mk_user('noncap@life.test') nocap_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage,tenants.managers.manage}'::text[], 'bootstrap' from pa
  union all select nocap_uid, '{platform_audit.view}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select nocap_uid from pa)) nocap_sid;
create temp table st as select s.*, null::uuid sid from tests.mk_staff((select b from fx), 'bstaff', 'bstaff@life.test') s;
update st set sid = tests.mk_session(user_id, (select b from fx), staff_id);
create temp table res (k text primary key, v uuid);

-- authorization
select tests.act_anon();
select tests.throws_ok($$select public.platform_create_tenant('X', 'life-x', 'active', 'x@life.test', repeat('a',64))$$,
  '42501', null, 'anon cannot create tenants');
select tests.reset();
select tests.claims((select user_id from st), (select sid from st));
select tests.throws_ok($$select public.platform_create_tenant('X', 'life-x', 'active', 'x@life.test', repeat('a',64))$$,
  '42501', null, 'tenant staff cannot create tenants');
select tests.throws_ok($$select public.platform_list_tenants()$$, '42501', null, 'tenant staff cannot list tenants');
select tests.throws_ok($$select public.platform_set_tenant_state(gen_random_uuid(), 'suspended')$$, '42501', null, 'tenant staff cannot suspend');
select tests.reset();
select tests.claims((select nocap_uid from pa), (select nocap_sid from ps));
select tests.throws_ok($$select public.platform_create_tenant('X', 'life-x', 'active', 'x@life.test', repeat('a',64))$$,
  '42501', null, 'platform admin without tenants.manage cannot create tenants');
select tests.reset();

-- create: validation codes
select tests.claims((select uid from pa), (select sid from ps));
select tests.throws_ok($$select public.platform_create_tenant('  ', 'life-x', 'active', 'x@life.test', repeat('a',64))$$,
  'P0001', 'name_required', 'missing name rejected');
select tests.throws_ok($$select public.platform_create_tenant('X', 'Bad_Sub', 'active', 'x@life.test', repeat('a',64))$$,
  'P0001', 'subdomain_invalid', 'invalid subdomain rejected');
select tests.throws_ok($$select public.platform_create_tenant('X', '-bad', 'active', 'x@life.test', repeat('a',64))$$,
  'P0001', 'subdomain_invalid', 'leading hyphen rejected');
select tests.throws_ok($$select public.platform_create_tenant('X', 'admin', 'active', 'x@life.test', repeat('a',64))$$,
  'P0001', 'subdomain_reserved', 'reserved subdomain rejected');
select tests.throws_ok($$select public.platform_create_tenant('X', 'life-b', 'active', 'x@life.test', repeat('a',64))$$,
  'P0001', 'subdomain_taken', 'duplicate subdomain rejected');
select tests.throws_ok($$select public.platform_create_tenant('X', 'portal', 'active', 'x@life.test', repeat('a',64))$$,
  'P0001', 'subdomain_taken', 'portal belongs to the Araak organization');

-- create: success issues the initial manager invitation and audits both streams
insert into res select 'a', public.platform_create_tenant('Org A', 'life-a', 'active', 'Mgr-A@Life.test', repeat('b',64));
select tests.reset();
select is((select count(*)::int from public.tenants where subdomain = 'life-a'), 1, 'tenant created');
select is((select count(*)::int from public.staff_invitations i where i.tenant_id = (select v from res where k='a')
           and i.grants_manager and i.recipient_email_normalized = 'mgr-a@life.test' and i.state = 'pending'), 1,
  'first-manager invitation issued (grants_manager)');
select is((select count(*)::int from public.staff_invitation_links where tenant_id = (select v from res where k='a')
           and token_hash = repeat('b',64)), 1, 'invitation link stored by hash only');
select is((select count(*)::int from public.platform_audit_events where event = 'tenant.created'
           and metadata->>'tenantId' = (select v::text from res where k='a')), 1, 'tenant.created in platform audit');
select is((select count(*)::int from public.tenant_audit_events where event = 'tenant.created'
           and tenant_id = (select v from res where k='a')), 1, 'tenant.created in tenant audit');

-- email conflict rolls the whole creation back, neutrally
select tests.claims((select uid from pa), (select sid from ps));
select tests.throws_ok($$select public.platform_create_tenant('Org C', 'life-c', 'active', 'mgr-a@life.test', repeat('c',64))$$,
  'P0001', 'email_unavailable', 'email already reserved: neutral failure');
select tests.reset();
select is((select count(*)::int from public.tenants where subdomain = 'life-c'), 0, 'failed creation leaves no tenant behind');

-- creating as suspended
select tests.claims((select uid from pa), (select sid from ps));
insert into res select 'd', public.platform_create_tenant('Org D', 'life-d', 'suspended', 'mgr-d@life.test', repeat('d',64));
select tests.reset();
select is((select state::text from public.tenants where subdomain = 'life-d'), 'suspended', 'tenant can start suspended');
select is((select count(*)::int from public.staff_invitations where tenant_id = (select v from res where k='d')), 1, 'suspended-at-creation tenant still has its invitation');

-- immutability through the platform RPCs
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_update_tenant_name(%L, 'Renamed B')$$, (select b from fx)), 'rename allowed');
select tests.reset();
select is((select display_name from public.tenants where id = (select b from fx)), 'Renamed B', 'name updated');
select is((select subdomain from public.tenants where id = (select b from fx)), 'life-b', 'subdomain untouched by rename');
select tests.throws_ok(format($$update public.tenants set subdomain = 'other' where id = %L$$, (select b from fx)),
  null, null, 'subdomain immutable at table level too');
select tests.claims((select uid from pa), (select sid from ps));
select tests.throws_ok(format($$select public.platform_update_tenant_name(%L, '   ')$$, (select b from fx)), 'P0001', 'name_required', 'blank rename rejected');
-- the platform applies the same name rule as the manager's branding form (docs/decisions/branding.md §3)
select tests.throws_ok(format($$select public.platform_update_tenant_name(%L, %L)$$, (select b from fx), repeat('n', 81)), 'P0001', 'name_invalid', 'over-long rename rejected');
select tests.throws_ok(format($$select public.platform_update_tenant_name(%L, '<b>B</b>')$$, (select b from fx)), 'P0001', 'name_invalid', 'markup in a rename rejected');
select tests.throws_ok($$select public.platform_create_tenant(repeat('n', 81), 'life-x', 'active', 'x@life.test', repeat('a',64))$$,
  'P0001', 'name_invalid', 'over-long name rejected at creation');
select tests.reset();
select is((select count(*)::int from public.tenant_audit_events where tenant_id = (select b from fx) and category = 'tenant_settings' and event = 'tenant.name_updated'), 1, 'rename audited under tenant_settings');

-- suspension / reactivation
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_set_tenant_state(%L, 'suspended')$$, (select v from res where k='a')), 'suspend A');
select tests.throws_ok(format($$select public.platform_set_tenant_state(%L, 'deleted')$$, (select b from fx)), null, null, 'only active/suspended exist');
select tests.reset();
select is((select state::text from public.tenants where id = (select v from res where k='a')), 'suspended', 'A suspended');
select is((select state::text from public.tenants where id = (select b from fx)), 'active', 'B unaffected');
select is((select count(*)::int from public.platform_audit_events where event = 'tenant.suspended'), 1, 'suspension audited (platform)');

-- A staff are denied while suspended; B staff are not
create temp table ast as select s.*, null::uuid sid from tests.mk_staff((select v from res where k='a'), 'astaff', 'astaff@life.test') s;
update ast set sid = tests.mk_session(user_id, (select v from res where k='a'), staff_id);
select tests.claims((select user_id from ast), (select sid from ast));
select is(private.request_context_ok(), false, 'suspended tenant: request_context_ok false for A staff');
select tests.reset();
select tests.claims((select user_id from st), (select sid from st));
select is(private.request_context_ok(), true, 'tenant B staff unaffected');
select tests.reset();
select tests.claims((select user_id from ast), (select sid from ast));
select tests.throws_ok($$select public.my_effective_permissions()$$, '42501', null, 'tenant RPCs refuse A staff while suspended');
select tests.reset();

-- reactivation restores access; a disabled individual stays disabled
update public.tenant_staff set enabled = false where id = (select staff_id from ast);
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_set_tenant_state(%L, 'active')$$, (select v from res where k='a')), 'reactivate A');
select tests.reset();
select tests.claims((select user_id from ast), (select sid from ast));
select is(private.request_context_ok(), false, 'disabled individual stays disabled after reactivation');
select tests.reset();
update public.tenant_staff set enabled = true where id = (select staff_id from ast);
select tests.claims((select user_id from ast), (select sid from ast));
select is(private.request_context_ok(), true, 'reactivation restores access under existing sessions');
select tests.reset();
select is((select count(*)::int from public.platform_audit_events where event = 'tenant.activated'), 1, 'reactivation audited');

-- list / get expose metadata only
select tests.claims((select uid from pa), (select sid from ps));
select is((select count(*)::int from public.platform_list_tenants() t where t.subdomain in ('life-a','life-b','life-d')), 3, 'list returns tenants');
select is((select (public.platform_get_tenant((select v from res where k='a')))->>'subdomain'), 'life-a', 'get returns a tenant');
select is((select (public.platform_get_tenant((select v from res where k='a'))) ? 'email_normalized'), false, 'no tenant-private data in get');
select tests.reset();
