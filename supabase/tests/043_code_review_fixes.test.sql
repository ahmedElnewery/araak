-- Regression tests for 20261015150039_code_review_fixes.sql
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('crf-a') a, tests.mk_tenant('crf-b') b;
create temp table pa as select tests.mk_user('root@crf.test') uid, tests.mk_user('mgrs@crf.test') mgrs_uid,
  tests.mk_user('staffcap@crf.test') staff_uid, tests.mk_user('audit@crf.test') audit_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage}'::text[], 'bootstrap' from pa
  union all select mgrs_uid, '{tenants.managers.manage}'::text[], 'bootstrap' from pa
  union all select staff_uid, '{tenants.staff.manage}'::text[], 'bootstrap' from pa
  union all select audit_uid, '{platform_audit.view}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select mgrs_uid from pa)) mgrs_sid,
  tests.mk_psession((select staff_uid from pa)) staff_sid, tests.mk_psession((select audit_uid from pa)) audit_sid;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'a1', s.*, null from tests.mk_staff((select a from fx), 'alpha', 'Alpha@Crf.test') s;
insert into st select 'b1', s.*, null from tests.mk_staff((select b from fx), 'beta', 'beta@crf.test') s;
update st set sid = tests.mk_session(user_id, case when k = 'b1' then (select b from fx) else (select a from fx) end, staff_id);

-- ---- login resolution returns the address the Auth user was created with -------------------------------------------
-- the display address keeps its case; the Auth identity (and sign-in) uses the normalized one
select is(private.resolve_login_email((select a from fx), 'alpha'), 'alpha@crf.test', 'username resolves to the normalized email');
select is(private.resolve_login_email((select a from fx), ' ALPHA@crf.test' || chr(160)), 'alpha@crf.test', 'email with edge whitespace resolves');
select is(private.resolve_login_email((select b from fx), 'alpha'), null, 'another tenant resolves nothing');

-- ---- invitations store the display address without edge whitespace ---------------------------------------------------
select tests.claims((select uid from pa), (select sid from ps));
create temp table inv as select public.platform_create_tenant('Org E', 'crf-e', 'active', 'New.Mgr@Crf.test' || chr(160), repeat('e', 64)) tid;
select tests.reset();
select is((select recipient_email from public.staff_invitations where tenant_id = (select tid from inv)), 'New.Mgr@Crf.test',
  'an NBSP at the edge is not stored in the display address');
select is((select recipient_email_normalized from public.staff_invitations where tenant_id = (select tid from inv)), 'new.mgr@crf.test',
  'normalized address unchanged');
select is(private.assert_email_shape(chr(65279) || 'x@crf.test '), 'x@crf.test', 'assert_email_shape trims the same set as normalize_email');

-- ---- tenant list/detail reachable with any tenant capability; staff list only with tenants.staff.manage --------------
select tests.claims((select mgrs_uid from pa), (select mgrs_sid from ps));
select ok((select count(*) from public.platform_list_tenants()) >= 2, 'managers capability alone can list tenants');
select is(public.platform_get_tenant((select a from fx)) ->> 'subdomain', 'crf-a', 'managers capability alone can open a tenant');
select tests.throws_ok(format($$select public.platform_update_tenant_name(%L, 'X')$$, (select a from fx)), '42501', null, 'but cannot rename it');
select tests.throws_ok(format($$select public.platform_list_tenant_staff(%L)$$, (select a from fx)), '42501', null, 'nor list its staff');
select tests.reset();
select tests.claims((select staff_uid from pa), (select staff_sid from ps));
select is(public.platform_get_tenant((select a from fx)) ->> 'subdomain', 'crf-a', 'staff capability alone can open a tenant');
select is(jsonb_array_length(public.platform_list_tenant_staff((select a from fx))), 1, 'staff capability lists that tenant''s staff only');
select is(public.platform_list_tenant_staff((select a from fx)) -> 0 ->> 'username', 'alpha', 'staff row carries the username');
select tests.reset();
select tests.claims((select audit_uid from pa), (select audit_sid from ps));
select tests.throws_ok($$select public.platform_list_tenants()$$, '42501', null, 'no tenant capability: no tenant list');
select tests.throws_ok(format($$select public.platform_get_tenant(%L)$$, (select a from fx)), '42501', null, 'no tenant capability: no tenant detail');
select tests.reset();
select tests.claims((select user_id from st where k = 'a1'), (select sid from st where k = 'a1'));
select tests.throws_ok(format($$select public.platform_list_tenant_staff(%L)$$, (select a from fx)), '42501', null, 'tenant staff cannot use it');
select tests.reset();

-- ---- platform sessions are renewed by verified activity (FR-018) -----------------------------------------------------
update public.session_registry set verified_activity_at = now() - interval '2 minutes' where provider_session_id = (select sid from ps);
select tests.claims((select uid from pa), (select sid from ps));
select is(public.touch_session_activity(), true, 'a platform session is renewed after 60 s');
select is(public.touch_session_activity(), false, 'and throttled to once per 60 s');
select tests.reset();
update public.platform_admins set enabled = false where auth_user_id = (select uid from pa);
update public.session_registry set verified_activity_at = now() - interval '2 minutes' where provider_session_id = (select sid from ps);
select tests.claims((select uid from pa), (select sid from ps));
select is(public.touch_session_activity(), false, 'a disabled platform admin is not renewed');
select tests.reset();
update public.platform_admins set enabled = true where auth_user_id = (select uid from pa);
update public.session_registry set verified_activity_at = now() - interval '31 days' where provider_session_id = (select sid from ps);
select tests.claims((select uid from pa), (select sid from ps));
select is(public.touch_session_activity(), false, 'a dead platform session stays dead');
select tests.reset();

-- ---- platform sign-in throttling ---------------------------------------------------------------------------------------
create temp table thr as select '00000000-0000-0000-0000-000000000000'::uuid scope;
select is((select count(*)::int from generate_series(1, 5) g
           where private.check_and_record_auth_attempt((select scope from thr), 'platform_sign_in', 'id-hmac', 'ip-' || g)), 5,
  'five platform sign-in attempts per identifier are allowed');
select is(private.check_and_record_auth_attempt((select scope from thr), 'platform_sign_in', 'id-hmac', 'ip-9'), false,
  'the sixth for the same identifier is throttled');
select is(private.check_and_record_auth_attempt((select a from fx), 'sign_in', 'id-hmac', 'ip-9'), true,
  'platform counters never throttle a tenant sign-in');

-- ---- set_my_preferences accepts a single named argument -------------------------------------------------------------
select tests.claims((select user_id from st where k = 'a1'), (select sid from st where k = 'a1'));
select tests.lives_ok($$select public.set_my_preferences(p_theme => 'dark')$$, 'an omitted argument still resolves the function');
select is(public.get_my_preferences(), '{"locale":"ar","theme_mode":"dark"}'::jsonb, 'theme stored');
select tests.lives_ok($$select public.set_my_preferences(p_locale => 'en')$$, 'the other one alone');
select is(public.get_my_preferences(), '{"locale":"en","theme_mode":"dark"}'::jsonb, 'theme kept');
select tests.reset();
