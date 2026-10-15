-- T097 staff invitations (FR-009, CL-003, CL-004, CL-020..CL-022, SC-003)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create function tests.th(t text) returns text language sql as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
-- moves every link of an invitation into the past (issued_at and expires_at together, as the ttl check requires)
create function tests.age_links(p_inv uuid, p_by interval) returns void language sql as
  $$ update public.staff_invitation_links set issued_at = issued_at - p_by, expires_at = expires_at - p_by where invitation_id = p_inv $$;

create temp table fx as select tests.mk_tenant('inv-a') a, tests.mk_tenant('inv-b') b;
create temp table pa as select tests.mk_user('root@inv.test') uid, tests.mk_user('nocap@inv.test') nocap_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage,tenants.staff.manage}'::text[], 'bootstrap' from pa
  union all select nocap_uid, '{tenants.manage}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select nocap_uid from pa)) nocap_sid;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'mgr', s.*, null from tests.mk_staff((select a from fx), 'manager', 'mgr@inv.test') s;
insert into st select 'inviter', s.*, null from tests.mk_staff((select a from fx), 'inviter', 'inviter@inv.test') s;
insert into st select 'plain', s.*, null from tests.mk_staff((select a from fx), 'plain', 'plain@inv.test') s;
insert into st select 'bmgr', s.*, null from tests.mk_staff((select b from fx), 'bmanager', 'bmgr@inv.test') s;
update st set sid = tests.mk_session(user_id, case when k = 'bmgr' then (select b from fx) else (select a from fx) end, staff_id);
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select a from fx), staff_id, (select uid from pa) from st where k = 'mgr'
  union all select (select b from fx), staff_id, (select uid from pa) from st where k = 'bmgr';
create temp table rl (k text primary key, id uuid);
insert into rl select 'inviters', tests.mk_role((select a from fx), 'Inviters');
insert into rl select 'also', tests.mk_role((select a from fx), 'AlsoInviters');
insert into rl select 'viewers', tests.mk_role((select a from fx), 'Viewers');
insert into rl select 'old', tests.mk_role((select a from fx), 'Old');
insert into rl select 'b', tests.mk_role((select b from fx), 'BRole');
update public.roles set archived_at = now() where id = (select id from rl where k = 'old');
insert into public.permission_grants (tenant_id, role_id, permission_key)
  select (select a from fx), id, 'staff.invite' from rl where k in ('inviters', 'also');
insert into public.permission_grants (tenant_id, role_id, permission_key) select (select a from fx), id, 'staff.view' from rl where k = 'viewers';
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), (select staff_id from st where k = 'inviter'), (select id from rl where k = 'inviters');
create temp table inv (k text primary key, id uuid);

-- ---- authorization -------------------------------------------------------------------------------------------------
select tests.claims((select user_id from st where k='plain'), (select sid from st where k='plain'));
select tests.throws_ok($$select public.invite_staff('x@inv.test', '{}', tests.th('p1'))$$, '42501', null, 'staff without staff.invite cannot invite');
select tests.reset();

select tests.claims((select user_id from st where k='inviter'), (select sid from st where k='inviter'));
select tests.throws_ok(format($$select public.invite_staff('x@inv.test', array[%L]::uuid[], tests.th('p2'))$$, (select id from rl where k='viewers')),
  'P0001', 'role_not_grantable', 'role above the inviter''s grant ceiling is refused');
select tests.throws_ok(format($$select public.invite_staff('x@inv.test', array[%L]::uuid[], tests.th('p3'))$$, (select id from rl where k='old')),
  'P0001', 'role_not_grantable', 'archived role is refused');
select tests.throws_ok(format($$select public.invite_staff('x@inv.test', array[%L]::uuid[], tests.th('p4'))$$, (select id from rl where k='b')),
  'P0001', 'role_not_grantable', 'role of another tenant is refused');
select tests.throws_ok($$select public.invite_staff('not-an-email', '{}', tests.th('p5'))$$, 'P0001', 'email_invalid', 'malformed email refused');
insert into inv select 'ok', public.invite_staff('Newbie@Inv.test', array[(select id from rl where k='inviters')], tests.th('i-ok'));
select tests.reset();
select is((select count(*)::int from public.staff_invitations where recipient_email_normalized = 'newbie@inv.test' and not grants_manager), 1, 'invitation stored, never with manager authority');
select is((select count(*)::int from public.tenant_audit_events where event = 'invitation.issued' and category = 'invitations' and resource_id = (select id::text from inv where k='ok')), 1, 'issuance audited');
select throws_ok($$insert into public.staff_invitations (tenant_id, recipient_email, recipient_email_normalized, grants_manager, invited_by_staff_id)
  select a, 'm@inv.test', 'm@inv.test', true, (select staff_id from st where k='mgr') from fx$$, '23514', null, 'a tenant actor can never be the inviter of a manager-authority invitation');
select is((select count(*)::int from public.staff_invitations where grants_manager and invited_by_staff_id is not null), 0, 'no manager-authority invitation from a tenant actor exists');

select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select throws_ok($$select public.invite_staff('newbie@inv.test', '{}', tests.th('p6'))$$, 'P0001', 'email_unavailable', 'second open invitation for the same email is refused neutrally');
insert into inv select 'mgr', public.invite_staff('byman@inv.test', array[(select id from rl where k='viewers'), (select id from rl where k='viewers')], tests.th('i-mgr'));
select is((select count(*)::int from public.staff_invitation_roles where invitation_id = (select id from inv where k='mgr')), 1, 'duplicate roles collapse');
select tests.reset();
-- another tenant cannot invite an address held by a pending invitation (global reservation)
select tests.claims((select user_id from st where k='bmgr'), (select sid from st where k='bmgr'));
select throws_ok($$select public.invite_staff('newbie@inv.test', '{}', tests.th('p7'))$$, 'P0001', 'email_unavailable', 'tenant B cannot invite an address pending in tenant A');
select tests.reset();

-- platform admin invite
select tests.claims((select nocap_uid from pa), (select nocap_sid from ps));
select throws_ok(format($$select public.platform_invite_staff(%L, 'p@inv.test', '{}', tests.th('p8'))$$, (select a from fx)), '42501', null, 'platform_invite_staff needs tenants.staff.manage');
select tests.reset();
select tests.claims((select uid from pa), (select sid from ps));
insert into inv select 'plat', public.platform_invite_staff((select a from fx), 'plat@inv.test', '{}', tests.th('i-plat'));
select is((select grants_manager from public.staff_invitations where id = (select id from inv where k='plat')), false, 'platform_invite_staff never grants manager authority');
select tests.reset();

-- ---- expiry boundary + single use ----------------------------------------------------------------------------------
create temp table u as select tests.mk_user('newbie@inv.test') uid, tests.mk_user('byman@inv.test') uid2, tests.mk_user('plat@inv.test') uid3;
select tests.age_links((select id from inv where k='ok'), interval '167:59:59');
select is((private.peek_staff_invitation(tests.th('i-ok')))->>'valid', 'true', 'valid at +167:59:59');
select is(private.redeem_staff_invitation(tests.th('i-ok'), (select uid from u), 'Newbie') is not null, true, 'redemption works at +167:59:59');
select is((select count(*)::int from public.tenant_staff where auth_user_id = (select uid from u)), 1, 'exactly one tenant_staff created');
select is((select count(*)::int from public.staff_roles sr join public.tenant_staff s on s.id = sr.staff_id where s.auth_user_id = (select uid from u)), 1, 'invitation roles applied');
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('i-ok'), %L, 'Another')$$, (select uid from u)), 'P0001', 'invitation_invalid', 'single use: second redemption refused');
select is((select count(*)::int from public.email_reservations where email_normalized = 'newbie@inv.test'), 0, 'reservation released after redemption');
select tests.age_links((select id from inv where k='mgr'), interval '168 hours');
select is((private.peek_staff_invitation(tests.th('i-mgr')))->>'valid', 'false', 'invalid at exactly +168:00:00');
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('i-mgr'), %L, 'Byman')$$, (select uid2 from u)), 'P0001', 'invitation_invalid', 'redemption refused at exactly +168:00:00');
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('nope'), %L, 'Byman')$$, (select uid2 from u)), 'P0001', 'invitation_invalid', 'unknown link refused');
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('i-plat'), %L, 'bad name')$$, (select uid3 from u)), 'P0001', 'username_invalid', 'invalid username refused');
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('i-plat'), %L, 'Newbie')$$, (select uid3 from u)), 'P0001', 'username_taken', 'case-insensitive username uniqueness at activation');
select is((select state from public.staff_invitations where id = (select id from inv where k='plat')), 'pending', 'failed activation consumes nothing');

-- ---- resend: authorization, cooldown, cap --------------------------------------------------------------------------
select tests.claims((select user_id from st where k='inviter'), (select sid from st where k='inviter'));
select throws_ok(format($$select public.resend_staff_invitation(%L, tests.th('r0'))$$, (select id from inv where k='mgr')), '42501', null, 'staff with staff.invite but without manager authority cannot resend');
select tests.reset();
select tests.claims((select nocap_uid from pa), (select nocap_sid from ps));
select throws_ok(format($$select public.platform_resend_staff_invitation(%L, tests.th('r0'))$$, (select id from inv where k='mgr')), '42501', null, 'platform resend needs tenants.staff.manage');
select tests.reset();

-- expired invitation is resent (not re-issued); cooldown has long passed
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select is(public.resend_staff_invitation((select id from inv where k='mgr'), tests.th('r-exp')), 'byman@inv.test', 'expired invitation can be resent; recipient returned for mailing');
select is((select count(*)::int from public.staff_invitation_links where invitation_id = (select id from inv where k='mgr') and superseded_at is null and expires_at > now()), 1, 'exactly one live link after resend');
select tests.reset();

-- cooldown boundary on the platform invitation
select tests.age_links((select id from inv where k='plat'), interval '899 seconds');
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select throws_ok(format($$select public.resend_staff_invitation(%L, tests.th('r1'))$$, (select id from inv where k='plat')), 'P0001', 'resend_cooldown', 'resend at 899s is denied');
select tests.reset();
select is((select count(*)::int from public.staff_invitation_links where invitation_id = (select id from inv where k='plat') and superseded_at is null), 1, 'denied resend leaves the existing link live');
select is((select count(*)::int from public.staff_invitation_links where invitation_id = (select id from inv where k='plat')), 1, 'denied resend adds no link');
select tests.age_links((select id from inv where k='plat'), interval '1 second');
select tests.claims((select uid from pa), (select sid from ps));
select lives_ok(format($$select public.platform_resend_staff_invitation(%L, tests.th('r2'))$$, (select id from inv where k='plat')), 'resend at 900s is allowed (platform admin)');
select tests.reset();
select is((select count(*)::int from public.staff_invitation_links where invitation_id = (select id from inv where k='plat') and superseded_at is not null), 1, 'earlier link superseded');
select is((select (expires_at - issued_at) = interval '168 hours' from public.staff_invitation_links where token_hash = tests.th('r2')), true, 'fresh 168h link');
select is((private.peek_staff_invitation(tests.th('i-plat')))->>'valid', 'false', 'superseded link no longer redeems');
select is((private.peek_staff_invitation(tests.th('r2')))->>'valid', 'true', 'fresh link redeems');

-- cap: 5 resends within a rolling 24h; initial issuance is not counted
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
do $$
declare i int; inv_id uuid := (select id from inv where k='plat');
begin
  for i in 3..6 loop   -- resend #1 already happened above; four more reach the cap of 5
    perform tests.age_links(inv_id, interval '901 seconds');
    perform public.resend_staff_invitation(inv_id, tests.th('r' || i));
  end loop;
end $$;
select tests.age_links((select id from inv where k='plat'), interval '901 seconds');
select throws_ok(format($$select public.resend_staff_invitation(%L, tests.th('r-6th'))$$, (select id from inv where k='plat')), 'P0001', 'resend_cap_reached', 'the 6th resend within 24h is denied');
select tests.reset();
select is((select count(*)::int from public.staff_invitation_links where invitation_id = (select id from inv where k='plat') and kind = 'resend'), 5, 'cap denial has no side effect (5 resend links)');
select is((select count(*)::int from public.staff_invitation_links where invitation_id = (select id from inv where k='plat') and kind = 'initial'), 1, 'initial link not counted toward the cap');
select is((select (l.superseded_at is null) from public.staff_invitation_links l where l.token_hash = tests.th('r6')), true, 'cap denial leaves the newest link live');
-- the oldest resend leaves the window: allowed again
update public.staff_invitation_links set issued_at = now() - interval '25 hours', expires_at = now() - interval '25 hours' + interval '168 hours'
 where token_hash = tests.th('r2');
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select lives_ok(format($$select public.resend_staff_invitation(%L, tests.th('r-again'))$$, (select id from inv where k='plat')), 'resend allowed again once the oldest resend left the window');
-- listing: tenant scoped, no token material
select is((public.list_pending_invitations())::text ~* 'token|hash', false, 'listing exposes no token data');
select is((select jsonb_array_length(public.list_pending_invitations())), 2, 'listing shows this tenant''s pending invitations only (ok redeemed; mgr + plat pending)');
select tests.reset();

-- ---- no cancellation -----------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public','private') and p.proname ~* '(cancel|revoke|delete|withdraw).*invit|invit.*(cancel|revoke|delete|withdraw)'), 0, 'no invitation cancel function exists');
select tests.act_as((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select throws_ok($$update public.staff_invitations set state = 'redeemed'$$, '42501', null, 'direct UPDATE of invitations denied');
select throws_ok($$delete from public.staff_invitation_links$$, '42501', null, 'direct DELETE of links denied');
select tests.reset();
select is(has_function_privilege('authenticated', 'private.redeem_staff_invitation(text, uuid, text)', 'execute'), false, 'redemption is service_role only');
select is(has_function_privilege('authenticated', 'public.svc_redeem_staff_invitation(text, uuid, text)', 'execute'), false, 'redemption wrapper is service_role only');
select is(has_function_privilege('anon', 'public.invite_staff(text, uuid[], text)', 'execute'), false, 'anon cannot invite');
