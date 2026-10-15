-- T076 platform admin invitations (FR-001, CL-040..CL-042, SC-002)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

-- admins that already exist in the target project (e.g. the real bootstrapped one) must not affect the assertions
create temp table base_admins as select auth_user_id from public.platform_admins;
create temp table pa as select tests.mk_user('root@pinv.test') uid, tests.mk_user('limited@pinv.test') lim_uid, tests.mk_user('noinv@pinv.test') noinv_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage,platform_admins.invite,platform_audit.view}'::text[], 'bootstrap' from pa
  union all select lim_uid, '{platform_admins.invite,tenants.manage}'::text[], 'bootstrap' from pa
  union all select noinv_uid, '{tenants.manage}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select lim_uid from pa)) lim_sid,
  tests.mk_psession((select noinv_uid from pa)) noinv_sid;
create temp table inv (k text primary key, id uuid);

select tests.claims((select noinv_uid from pa), (select noinv_sid from ps));
select tests.throws_ok($$select public.platform_invite_admin('x@pinv.test', '{tenants.manage}', repeat('1',64))$$, '42501', null,
  'only platform_admins.invite holders can invite');
select tests.reset();
select tests.claims((select lim_uid from pa), (select lim_sid from ps));
select tests.throws_ok($$select public.platform_invite_admin('x@pinv.test', '{platform_audit.view}', repeat('1',64))$$, 'P0001', 'capabilities_exceed_inviter',
  'granted capabilities must be a subset of the inviter''s');
select tests.throws_ok($$select public.platform_invite_admin('x@pinv.test', '{bogus.cap}', repeat('1',64))$$, 'P0001', 'capabilities_invalid', 'unknown capability rejected');
select tests.throws_ok($$select public.platform_invite_admin('x@pinv.test', '{}', repeat('1',64))$$, 'P0001', 'capabilities_invalid', 'at least one capability required');
select tests.reset();

select tests.claims((select uid from pa), (select sid from ps));
insert into inv select 'ok', public.platform_invite_admin('New.Admin@PInv.test', '{tenants.manage}', repeat('2',64));
select tests.reset();
select is((select count(*)::int from public.platform_invitations where recipient_email_normalized = 'new.admin@pinv.test' and consumed_at is null), 1, 'invitation stored with normalized email');
select is((select (expires_at - issued_at) = interval '24 hours' from public.platform_invitations where id = (select id from inv where k='ok')), true, 'ttl is exactly 24h');
select is((select count(*)::int from public.platform_admins a where a.auth_user_id not in (select uid from pa union select lim_uid from pa union select noinv_uid from pa union select auth_user_id from base_admins)), 0, 'no platform_admins row before redemption');
select is((select count(*)::int from public.platform_audit_events where event = 'platform_admin.invited'), 1, 'invitation audited');

-- peek / redeem boundary
create temp table nu as select tests.mk_user('new.admin@pinv.test') uid;
select is((select (private.peek_platform_invitation(repeat('2',64)))->>'valid'), 'true', 'peek: valid');
select is((select (private.peek_platform_invitation(repeat('9',64)))->>'valid'), 'false', 'peek: unknown token is invalid');

-- boundary: +23:59:59 redeems, exactly +24:00:00 does not
update public.platform_invitations set issued_at = now() - interval '23:59:59', expires_at = now() - interval '23:59:59' + interval '24 hours' where id = (select id from inv where k='ok');
select is((select (private.peek_platform_invitation(repeat('2',64)))->>'valid'), 'true', 'valid at +23:59:59');
update public.platform_invitations set issued_at = now() - interval '24 hours', expires_at = now() where id = (select id from inv where k='ok');
select is((select (private.peek_platform_invitation(repeat('2',64)))->>'valid'), 'false', 'invalid at exactly +24:00:00');
select is(private.redeem_platform_invitation(repeat('2',64), (select uid from nu)), false, 'redeem refused at exactly +24:00:00');
select is((select count(*)::int from public.platform_audit_events where event = 'platform_admin.invitation_rejected'), 1, 'rejected attempt is audited');
select is((select count(*)::int from public.platform_audit_events where event = 'platform_admin.invitation_rejected' and metadata::text like '%' || repeat('2',64) || '%'), 0, 'audit never contains the token or its hash');

-- fresh invitation for success / replay / mismatch paths
update public.platform_invitations set issued_at = now() - interval '23:59:59', expires_at = now() - interval '23:59:59' + interval '24 hours' where id = (select id from inv where k='ok');
create temp table other as select tests.mk_user('someone.else@pinv.test') uid;
select is(private.redeem_platform_invitation(repeat('2',64), (select uid from other)), false, 'mismatched recipient email refused');
select is((select count(*)::int from public.platform_admins where auth_user_id = (select uid from other)), 0, 'mismatch grants nothing');
select is(private.redeem_platform_invitation(repeat('2',64), (select uid from nu)), true, 'redeem succeeds at +23:59:59');
select is((select capabilities::text from public.platform_admins where auth_user_id = (select uid from nu)), '{tenants.manage}', 'capabilities as invited');
select is((select created_via from public.platform_admins where auth_user_id = (select uid from nu)), 'invitation', 'created_via invitation');
select is(private.redeem_platform_invitation(repeat('2',64), (select uid from nu)), false, 'single use: second redemption refused');
select is((select count(*)::int from public.platform_audit_events where event = 'platform_admin.invitation_accepted'), 1, 'acceptance audited');

-- an identity that is tenant staff can never become a platform admin (GATE-COLLIDE)
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok($$select public.platform_invite_admin('staffer@pinv.test', '{tenants.manage}', repeat('3',64))$$, 'invite for a would-be collision');
select tests.reset();
create temp table tt as select tests.mk_tenant('pinv-t') t;
create temp table ss as select s.* from tests.mk_staff((select t from tt), 'staffer', 'staffer@pinv.test') s;
select is(private.redeem_platform_invitation(repeat('3',64), (select user_id from ss)), false, 'tenant staff identity cannot be redeemed as platform admin');
select is((select count(*)::int from public.platform_admins where auth_user_id = (select user_id from ss)), 0, 'no admin row for a staff identity');

-- no removal / demotion function is executable by authenticated
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname ~ '(remove|revoke|delete|disable|demote).*(platform_admin|admin)'
             and has_function_privilege('authenticated', p.oid, 'execute')), 0, 'no platform-admin removal function is callable by authenticated');
select is((select count(*)::int from information_schema.role_table_grants where table_name = 'platform_admins' and grantee in ('authenticated','anon') and privilege_type in ('UPDATE','DELETE','INSERT')), 0, 'no direct write grants on platform_admins');
select is(has_function_privilege('authenticated', 'private.redeem_platform_invitation(text, uuid)', 'execute'), false, 'redeem is service_role only');
select is(has_function_privilege('authenticated', 'private.peek_platform_invitation(text)', 'execute'), false, 'peek is service_role only');
select is(has_function_privilege('service_role', 'private.redeem_platform_invitation(text, uuid)', 'execute'), true, 'service_role may redeem');
