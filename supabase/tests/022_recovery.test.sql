-- T099 password recovery (FR-015, FR-021, CL-015..CL-019, SC-004)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create function tests.th(t text) returns text language sql as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function tests.age_recovery(p_staff uuid, p_by interval) returns void language sql as
  $$ update public.recovery_requests set issued_at = issued_at - p_by, expires_at = expires_at - p_by where staff_id = p_staff $$;
create function tests.confirm(p_user uuid) returns void language sql as
  $$ insert into public.password_confirmations (actor_auth_user_id, confirmed_at, expires_at) values (p_user, now(), now() + interval '120 seconds') $$;

create temp table fx as select tests.mk_tenant('rc-a') a, tests.mk_tenant('rc-b') b;
create temp table pa as select tests.mk_user('root@rc.test') uid, tests.mk_user('nocap@rc.test') nocap_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage,tenants.staff.manage}'::text[], 'bootstrap' from pa
  union all select nocap_uid, '{tenants.manage}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select nocap_uid from pa)) nocap_sid;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'mgr', s.*, null from tests.mk_staff((select a from fx), 'manager', 'mgr@rc.test') s;
insert into st select 's1', s.*, null from tests.mk_staff((select a from fx), 'staffone', 's1@rc.test') s;
insert into st select 's2', s.*, null from tests.mk_staff((select a from fx), 'stafftwo', 's2@rc.test') s;
insert into st select 'off', s.*, null from tests.mk_staff((select a from fx), 'disabled', 'off@rc.test', false) s;
insert into st select 'plain', s.*, null from tests.mk_staff((select a from fx), 'plain', 'plain@rc.test') s;
insert into st select 'x', s.*, null from tests.mk_staff((select b from fx), 'xstaff', 'x@rc.test') s;
update st set sid = tests.mk_session(user_id, case when k = 'x' then (select b from fx) else (select a from fx) end, staff_id);
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select a from fx), staff_id, (select uid from pa) from st where k = 'mgr';
create temp view s1 as select staff_id from st where k = 's1';

-- ---- issuance, expiry, single use ----------------------------------------------------------------------------------
select is(private.issue_recovery((select staff_id from st where k='s1'), 'self_service', null, null, tests.th('t1')), true, 'self-service issuance succeeds');
select is((select (expires_at - issued_at) = interval '60 minutes' from public.recovery_requests where token_hash = tests.th('t1')), true, 'link lives exactly 60 minutes');
select is(private.issue_recovery((select staff_id from st where k='off'), 'self_service', null, null, tests.th('toff')), false, 'a disabled account gets no link');
select is(private.issue_recovery((select staff_id from st where k='s2'), 'self_service', null, null, tests.th('tsusp')) , true, 'enabled account in an active tenant');
update public.tenants set state = 'suspended' where id = (select a from fx);
select is(private.issue_recovery((select staff_id from st where k='plain'), 'self_service', null, null, tests.th('tplain')), false, 'a suspended tenant issues nothing');
update public.tenants set state = 'active' where id = (select a from fx);

select tests.age_recovery((select staff_id from s1), interval '59 minutes 59 seconds');
select is((private.begin_recovery_redemption(tests.th('t1')))->>'origin', 'self_service', 'redeem at +59:59 works');
select is(private.begin_recovery_redemption(tests.th('t1')), null, 'single use: second redemption refused');
select tests.age_recovery((select staff_id from s1), interval '1 second');   -- keep the used link out of the way
insert into public.recovery_requests (tenant_id, staff_id, origin, token_hash, issued_at, expires_at)
  select (select a from fx), staff_id, 'self_service', tests.th('t-edge'), now() - interval '60 minutes', now() from st where k = 'plain';
select is(private.begin_recovery_redemption(tests.th('t-edge')), null, 'rejected at exactly +60:00');
select is(private.begin_recovery_redemption(tests.th('nope')), null, 'unknown link rejected');

-- ---- newest-only across origins, cooldown, cap -----------------------------------------------------------------------
select tests.age_recovery((select staff_id from s1), interval '301 seconds');
select is(private.issue_recovery((select staff_id from s1), 'self_service', null, null, tests.th('t2')), true, 'issuance after the cooldown');
select tests.age_recovery((select staff_id from s1), interval '299 seconds');
select is(private.issue_recovery((select staff_id from s1), 'self_service', null, null, tests.th('t3')), false, '299s: denied');
select is((select superseded_at is null from public.recovery_requests where token_hash = tests.th('t2')), true, 'a denied issuance does not invalidate the current link');
select is((select count(*)::int from public.recovery_requests where token_hash = tests.th('t3')), 0, 'a denied issuance stores nothing');
select tests.age_recovery((select staff_id from s1), interval '1 second');
select is(private.issue_recovery((select staff_id from s1), 'manager_assisted', (select staff_id from st where k='mgr'), null, tests.th('t4')), true, '300s: allowed (manager origin)');
select is((select superseded_at is not null from public.recovery_requests where token_hash = tests.th('t2')), true, 'a manager-origin issuance supersedes the self-service link');
select is(private.begin_recovery_redemption(tests.th('t2')), null, 'the superseded link cannot be redeemed');
-- cap: issuances so far for s1: t1, t2, t4 = 3; two more reach 5; the sixth is denied
select tests.age_recovery((select staff_id from s1), interval '301 seconds');
select is(private.issue_recovery((select staff_id from s1), 'self_service', null, null, tests.th('t5')), true, '4th issuance');
select tests.age_recovery((select staff_id from s1), interval '301 seconds');
select is(private.issue_recovery((select staff_id from s1), 'self_service', null, null, tests.th('t6')), true, '5th issuance');
select tests.age_recovery((select staff_id from s1), interval '301 seconds');
select is(private.issue_recovery((select staff_id from s1), 'self_service', null, null, tests.th('t7')), false, 'the 6th issuance in 24h is denied');
select is((select count(*)::int from public.recovery_requests where staff_id = (select staff_id from s1)), 5, 'denied issuance leaves the count at 5');
select is((select superseded_at is null from public.recovery_requests where token_hash = tests.th('t6')), true, 'denied issuance leaves the newest link live');
select is(private.issue_recovery((select staff_id from st where k='s2'), 'self_service', null, null, tests.th('t-s2b')) is not null, true, 'another account is unaffected (independent counters)');

-- ---- manager-assisted reset ---------------------------------------------------------------------------------------
select tests.claims((select user_id from st where k='plain'), (select sid from st where k='plain'));
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m0'))$$, (select staff_id from st where k='s2')), '42501', null, 'only the manager authority may request a reset');
select tests.reset();
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m1'))$$, (select staff_id from st where k='plain')), 'P0001', 'confirmation_required', 'a fresh own-password confirmation is required');
select tests.reset();
select tests.confirm((select user_id from st where k='mgr'));
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m2'))$$, (select staff_id from st where k='x')), 'P0001', 'staff_not_found', 'target in another tenant: refused');
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m3'))$$, (select staff_id from st where k='off')), 'P0001', 'staff_not_eligible', 'disabled target: refused');
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m4'))$$, (select staff_id from st where k='mgr')), 'P0001', 'cannot_reset_self', 'self-reset through this path: refused');
select is(public.request_manager_assisted_reset((select staff_id from st where k='plain'), tests.th('m5')), 'plain@rc.test', 'with a confirmation the reset is issued; the target email is returned for mailing');
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m6'))$$, (select staff_id from st where k='s2')), 'P0001', 'confirmation_required', 'a confirmation is consumed exactly once');
select tests.reset();
select tests.confirm((select user_id from st where k='mgr'));
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m7'))$$, (select staff_id from st where k='plain')), 'P0001', 'recovery_rate_limited', 'cooldown applies to manager-assisted resets');
select tests.reset();
select is((select count(*)::int from public.password_confirmations where actor_auth_user_id = (select user_id from st where k='mgr') and consumed_at is null), 1, 'a denied reset does not consume the confirmation');
update public.password_confirmations set confirmed_at = now() - interval '121 seconds', expires_at = now() - interval '1 second' where consumed_at is null;
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select tests.throws_ok(format($$select public.request_manager_assisted_reset(%L, tests.th('m8'))$$, (select staff_id from st where k='s2')), 'P0001', 'confirmation_required', 'an expired (121s) confirmation is refused');
select tests.reset();
select is((select count(*)::int from public.recovery_requests where requested_by_staff_id = (select staff_id from st where k='mgr')), 2, 'only allowed manager-origin issuances exist (t4 and m5; every denied request stored nothing)');

-- ---- no platform-admin reset path (owner decision) ----
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname ~ 'platform.*reset'), 0, 'no platform-admin staff reset function exists');

-- ---- completion revokes ALL sessions ----------------------------------------------------------------------------------
create temp table extra as select tests.mk_session(user_id, (select a from fx), staff_id) sid from st where k = 'plain';
create temp table req as select (private.begin_recovery_redemption(tests.th('m5')))->>'requestId' id;
select is((select id from req) is not null, true, 'manager-assisted link redeems');
select private.complete_recovery_redemption((select id::uuid from req));
select is((select count(*)::int from public.session_registry where staff_id = (select staff_id from st where k='plain') and revoked_at is null), 0, 'every session of the target is revoked');
select is((select revoked_reason::text from public.session_registry where provider_session_id = (select sid from extra)), 'admin_reset', 'reason is admin_reset for assisted resets');
select is((select count(*)::int from public.session_registry where staff_id = (select staff_id from st where k='mgr') and revoked_at is null), 1, 'other accounts keep their sessions');
select is((select count(*)::int from public.tenant_audit_events where event = 'password.reset_completed'), 1, 'completion audited');
select is((select count(*)::int from public.tenant_audit_events where event = 'password.reset_initiated' and metadata::text ~ '[0-9a-f]{64}'), 0, 'audit never contains token material');

-- ---- privileges ---------------------------------------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'private.issue_recovery(uuid, text, uuid, uuid, text)', 'execute'), false, 'issue_recovery is not client-callable');
select is(has_function_privilege('authenticated', 'public.svc_begin_recovery_redemption(text)', 'execute'), false, 'redemption wrapper is service_role only');
select is((select count(*)::int from information_schema.role_table_grants where table_name in ('recovery_requests','password_confirmations') and grantee in ('anon','authenticated')), 0, 'no client grants on recovery tables');
