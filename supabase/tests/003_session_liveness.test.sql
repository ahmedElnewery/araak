select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('live-a') a;
create temp table s1 as select * from tests.mk_staff((select a from fx), 'alice', 'alice@live.test');
create temp table s2 as select * from tests.mk_staff((select a from fx), 'bobby', 'bobby@live.test');
create temp table ss as select
  tests.mk_session((select user_id from s1), (select a from fx), (select staff_id from s1)) live,
  tests.mk_session((select user_id from s1), (select a from fx), (select staff_id from s1), now(), true) revoked,
  tests.mk_session((select user_id from s1), (select a from fx), (select staff_id from s1), now() - interval '30 days') at30d,
  tests.mk_session((select user_id from s1), (select a from fx), (select staff_id from s1), now() - interval '29 days 23 hours') at29d23h,
  tests.mk_session((select user_id from s1), (select a from fx), (select staff_id from s1), now() - interval '30 days' + interval '2 seconds') just_inside,
  gen_random_uuid() missing;
grant all on fx, s1, s2, ss to public;

create function tests.live(p_user uuid, p_session uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform tests.act_as(p_user, p_session);
  select private.current_session_is_live() into r;
  perform tests.reset();
  return r;
end $$;

select is(tests.live((select user_id from s1), (select live from ss)), true, 'live session is live');
select is(tests.live((select user_id from s1), (select revoked from ss)), false, 'revoked session is not live');
select is(tests.live((select user_id from s1), (select at30d from ss)), false, 'activity exactly 30 days ago is not live');
select is(tests.live((select user_id from s1), (select at29d23h from ss)), true, 'activity 29d23h ago is live');
select is(tests.live((select user_id from s1), (select just_inside from ss)), true, 'activity 2 seconds inside the window is live');
select is(tests.live((select user_id from s2), (select live from ss)), false, 'session of another user is not live (mismatched auth.uid)');
select is(tests.live((select user_id from s1), (select missing from ss)), false, 'unregistered session is not live');
select is(tests.live((select user_id from s1), null), false, 'JWT without session_id is not live');
select is((select private.current_session_is_live()), false, 'no JWT at all is not live');

-- revoke_sessions
select is(private.revoke_sessions(array[(select live from ss)], 'sign_out'), 1, 'revoke_sessions revokes one registry row');
select is(tests.live((select user_id from s1), (select live from ss)), false, 'revoked via revoke_sessions is no longer live');
select is((select revoked_reason::text from public.session_registry where provider_session_id = (select live from ss)), 'sign_out', 'reason recorded');
select is(private.revoke_sessions(array[(select live from ss)], 'user'), 0, 'already revoked row is not revoked twice');

-- request_context_ok layers: disabled staff / suspended tenant
create temp table ss2 as select tests.mk_session((select user_id from s2), (select a from fx), (select staff_id from s2)) sid;
grant all on ss2 to public;
create function tests.ctx(p_user uuid, p_session uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform tests.act_as(p_user, p_session);
  select private.request_context_ok() into r;
  perform tests.reset();
  return r;
end $$;
select is(tests.ctx((select user_id from s2), (select sid from ss2)), true, 'context ok for enabled staff, active tenant, live session');
update public.tenant_staff set enabled = false where id = (select staff_id from s2);
select is(tests.ctx((select user_id from s2), (select sid from ss2)), false, 'context denied for disabled staff');
update public.tenant_staff set enabled = true where id = (select staff_id from s2);
update public.tenants set state = 'suspended' where id = (select a from fx);
select is(tests.ctx((select user_id from s2), (select sid from ss2)), false, 'context denied for suspended tenant');
update public.tenants set state = 'active' where id = (select a from fx);
select is(tests.ctx((select user_id from s2), (select sid from ss2)), true, 'context restored when tenant is active again');
