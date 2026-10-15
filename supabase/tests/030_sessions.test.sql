-- T124 session self-service RPCs (FR-020, CL-036..CL-039)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('se-a') a, tests.mk_tenant('se-b') b;
create temp table st (k text primary key, staff_id uuid, user_id uuid);
insert into st select 's1', s.* from tests.mk_staff((select a from fx), 'sessone', 's1@se.test') s;
insert into st select 's2', s.* from tests.mk_staff((select a from fx), 'sesstwo', 's2@se.test') s;
insert into st select 'x', s.* from tests.mk_staff((select b from fx), 'sessx', 'x@se.test') s;
insert into st select 'off', s.* from tests.mk_staff((select a from fx), 'sessoff', 'off@se.test', false) s;

create temp table ses (k text primary key, sid uuid, reg_id uuid);
insert into ses select 'cur', tests.mk_session((select user_id from st where k='s1'), (select a from fx), (select staff_id from st where k='s1')), null;
insert into ses select 'o1',  tests.mk_session((select user_id from st where k='s1'), (select a from fx), (select staff_id from st where k='s1')), null;
insert into ses select 'o2',  tests.mk_session((select user_id from st where k='s1'), (select a from fx), (select staff_id from st where k='s1')), null;
insert into ses select 'old', tests.mk_session((select user_id from st where k='s1'), (select a from fx), (select staff_id from st where k='s1'), now() - interval '31 days'), null;
insert into ses select 'rev', tests.mk_session((select user_id from st where k='s1'), (select a from fx), (select staff_id from st where k='s1'), now(), true), null;
insert into ses select 'p2',  tests.mk_session((select user_id from st where k='s2'), (select a from fx), (select staff_id from st where k='s2')), null;
insert into ses select 'px',  tests.mk_session((select user_id from st where k='x'), (select b from fx), (select staff_id from st where k='x')), null;
insert into ses select 'poff', tests.mk_session((select user_id from st where k='off'), (select a from fx), (select staff_id from st where k='off'), now() - interval '5 minutes'), null;
update ses set reg_id = (select id from public.session_registry where provider_session_id = ses.sid);
create function tests.rid(p_k text) returns uuid language sql as $$ select reg_id from ses where k = p_k $$;
create function tests.psid(p_k text) returns uuid language sql as $$ select sid from ses where k = p_k $$;
create function tests.live(p_k text) returns boolean language sql as
  $$ select revoked_at is null from public.session_registry where provider_session_id = (select sid from ses where k = p_k) $$;

-- ---- list_my_sessions ------------------------------------------------------------------------------------------------
select tests.claims((select user_id from st where k='s1'), tests.psid('cur'));
select is(jsonb_array_length(public.list_my_sessions()), 3, 'lists only own live unrevoked sessions (current + 2 others)');
select is((public.list_my_sessions() -> 0 ->> 'is_current')::boolean, true, 'the current session is flagged and listed first');
select is((select count(*)::int from jsonb_array_elements(public.list_my_sessions()) e where (e ->> 'is_current')::boolean), 1, 'exactly one current session');
select is((select array_agg(k order by k) from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(public.list_my_sessions()) e) q),
          array['browser','created_at','device_type','id','is_current','verified_activity_at'],
          'only id, device_type, browser, created_at, verified_activity_at and is_current are exposed (no token, IP, provider id)');
select is(public.list_my_sessions()::text like '%' || tests.psid('cur')::text || '%', false, 'the provider session id is never exposed');
select tests.claims((select user_id from st where k='s2'), tests.psid('p2'));
select is(jsonb_array_length(public.list_my_sessions()), 1, 'another account of the same tenant sees only its own session');
select tests.claims((select user_id from st where k='x'), tests.psid('px'));
select is(jsonb_array_length(public.list_my_sessions()), 1, 'the other tenant sees only its own session');
select tests.claims((select user_id from st where k='s1'), tests.psid('rev'));
select tests.throws_ok($$select public.list_my_sessions()$$, '42501', null, 'a revoked session cannot list sessions');
select tests.claims((select user_id from st where k='off'), tests.psid('poff'));
select tests.throws_ok($$select public.list_my_sessions()$$, '42501', null, 'a disabled account cannot list sessions');

-- ---- revoke_my_session -------------------------------------------------------------------------------------------------
select tests.claims((select user_id from st where k='s1'), tests.psid('cur'));
select tests.throws_ok(format($$select public.revoke_my_session(%L)$$, tests.rid('cur')), 'P0001', 'session_not_found', 'the current session cannot be revoked here');
select tests.throws_ok(format($$select public.revoke_my_session(%L)$$, tests.rid('p2')), 'P0001', 'session_not_found', 'another account''s session: neutral not-found');
select tests.throws_ok(format($$select public.revoke_my_session(%L)$$, tests.rid('px')), 'P0001', 'session_not_found', 'another tenant''s session: neutral not-found');
select tests.throws_ok(format($$select public.revoke_my_session(%L)$$, tests.rid('rev')), 'P0001', 'session_not_found', 'an already-revoked id: neutral not-found');
select tests.throws_ok(format($$select public.revoke_my_session(%L)$$, tests.rid('old')), 'P0001', 'session_not_found', 'a stale id: neutral not-found');
select tests.throws_ok($$select public.revoke_my_session(gen_random_uuid())$$, 'P0001', 'session_not_found', 'an unknown id: neutral not-found');
select is(tests.live('p2') and tests.live('px') and tests.live('cur'), true, 'failed attempts changed nothing');
select tests.lives_ok(format($$select public.revoke_my_session(%L)$$, tests.rid('o1')), 'an own other session is revoked');
select is(tests.live('o1'), false, 'the chosen session is revoked');
select is((select revoked_reason::text from public.session_registry where provider_session_id = tests.psid('o1')), 'user', 'reason recorded as user');
select is(tests.live('o2') and tests.live('cur'), true, 'the other and the current sessions stay live');
select tests.throws_ok(format($$select public.revoke_my_session(%L)$$, tests.rid('o1')), 'P0001', 'session_not_found', 'revoking twice is a neutral not-found');
select is((select count(*)::int from public.tenant_audit_events where category = 'sessions' and event = 'session.revoked'
             and resource_id = tests.rid('o1')::text and actor_staff_id = (select staff_id from st where k='s1')), 1, 'the revocation is audited once');
select is((select metadata::text like '%' || tests.psid('o1')::text || '%' from public.tenant_audit_events where resource_id = tests.rid('o1')::text), false, 'the audit holds no provider session id');

-- ---- revoke_my_other_sessions ------------------------------------------------------------------------------------------
select tests.throws_ok($$select public.revoke_my_other_sessions('recovery')$$, '42501', null, 'only user_all_others / password_change reasons are accepted');
select is(public.revoke_my_other_sessions(), 2, 'revokes every unrevoked other session (o2 and the stale one)');
select is(tests.live('cur'), true, 'the current session survives');
select is(tests.live('o2'), false, 'the other session is revoked');
select is((select revoked_reason::text from public.session_registry where provider_session_id = tests.psid('o2')), 'user_all_others', 'reason recorded as user_all_others');
select is(tests.live('p2') and tests.live('px'), true, 'sessions of other accounts and tenants are untouched');
select is(public.revoke_my_other_sessions(), 0, 'repeating it is idempotent');
update public.session_registry set revoked_at = null, revoked_reason = null where provider_session_id = tests.psid('o2');
select is(public.revoke_my_other_sessions('password_change'), 1, 'password_change reason is accepted');
select is((select revoked_reason::text from public.session_registry where provider_session_id = tests.psid('o2')), 'password_change', 'reason recorded as password_change');
select is((select count(*)::int from public.tenant_audit_events where category = 'sessions' and metadata ->> 'scope' = 'others'), 3, 'bulk revocations are audited');
select tests.claims((select user_id from st where k='s1'), tests.psid('rev'));
select tests.throws_ok($$select public.revoke_my_other_sessions()$$, '42501', null, 'a revoked session cannot revoke others');

-- ---- touch_session_activity --------------------------------------------------------------------------------------------
select tests.claims((select user_id from st where k='s1'), tests.psid('cur'));
select is(public.touch_session_activity(), false, 'a touch within 60 s of the last verified activity does nothing');
update public.session_registry set verified_activity_at = now() - interval '2 minutes' where provider_session_id = tests.psid('cur');
select is(public.touch_session_activity(), true, 'a touch after 60 s renews the session');
select is((select verified_activity_at > now() - interval '5 seconds' from public.session_registry where provider_session_id = tests.psid('cur')), true, 'activity time moved to now');
select tests.claims((select user_id from st where k='s1'), tests.psid('rev'));
select is(public.touch_session_activity(), false, 'a revoked session is not renewed');
select tests.claims((select user_id from st where k='s1'), tests.psid('old'));
select is(public.touch_session_activity(), false, 'a 31-day-old session is dead and not renewed');
select is((select verified_activity_at < now() - interval '30 days' from public.session_registry where provider_session_id = tests.psid('old')), true, 'the dead session stays dead');
select tests.claims((select user_id from st where k='off'), tests.psid('poff'));
select is(public.touch_session_activity(), false, 'a disabled account is not renewed');
select tests.claims((select user_id from st where k='s2'), tests.psid('cur'));
select is(public.touch_session_activity(), false, 'a session id belonging to another account is not renewed');

-- ---- privileges ---------------------------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'public.list_my_sessions()', 'execute'), false, 'anon cannot list sessions');
select is(has_function_privilege('anon', 'public.touch_session_activity()', 'execute'), false, 'anon cannot touch sessions');
select is(has_function_privilege('authenticated', 'public.revoke_my_session(uuid)', 'execute'), true, 'authenticated can call revoke_my_session');
select is((select count(*)::int from information_schema.columns where table_name = 'session_registry' and column_name ~* '(ip|geo|location|agent|token)'), 0, 'the registry has no IP, location, user-agent or token column');
