-- Staff first and last names: required at activation, self-service change, carried by the context and the directory.
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create function tests.th(t text) returns text language sql as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create temp table fx as select tests.mk_tenant('nm-a') a, tests.mk_tenant('nm-b') b;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'mgr', s.*, null from tests.mk_staff((select a from fx), 'Manager', 'mgr@nm.test') s;
insert into st select 'zed', s.*, null from tests.mk_staff((select a from fx), 'Zed', 'zed@nm.test') s;
insert into st select 'other', s.*, null from tests.mk_staff((select b from fx), 'Other', 'other@nm.test') s;
insert into st select 'off', s.*, null from tests.mk_staff((select a from fx), 'Off', 'off@nm.test', false) s;
update st set sid = tests.mk_session(user_id, case when k = 'other' then (select b from fx) else (select a from fx) end, staff_id);
create temp table pa as select tests.mk_user('root@nm.test') uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via) select uid, '{tenants.manage}'::text[], 'bootstrap' from pa;
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select a from fx), staff_id, (select uid from pa) from st where k = 'mgr';
create temp table stale as select tests.mk_session(user_id, (select a from fx), staff_id, now(), true) sid from st where k = 'zed';

-- ---- columns -------------------------------------------------------------------------------------------------------
select is((select first_name is null and last_name is null from public.tenant_staff where id = (select staff_id from st where k='zed')),
          true, 'an account activated before names existed has none');
select throws_ok(format($$update public.tenant_staff set first_name = 'Zed' where id = %L$$, (select staff_id from st where k='zed')),
                 '23514', null, 'a first name without a last name is refused');
select throws_ok(format($$update public.tenant_staff set first_name = ' Zed', last_name = 'Z' where id = %L$$, (select staff_id from st where k='zed')),
                 '23514', null, 'surrounding spaces are refused');
select throws_ok(format($$update public.tenant_staff set first_name = '<b>', last_name = 'Z' where id = %L$$, (select staff_id from st where k='zed')),
                 '23514', null, 'markup is refused');
select throws_ok(format($$update public.tenant_staff set first_name = %L, last_name = 'Z' where id = %L$$, repeat('a', 51), (select staff_id from st where k='zed')),
                 '23514', null, 'more than 50 characters is refused');

-- ---- activation requires both names --------------------------------------------------------------------------------
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
create temp table inv as select public.invite_staff('new@nm.test', '{}', tests.th('nm-1')) id;
select tests.reset();
create temp table u as select tests.mk_user('new@nm.test') uid;
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('nm-1'), %L, 'Newbie', '', 'Ali')$$, (select uid from u)),
                 'P0001', 'first_name_invalid', 'an empty first name is refused at activation');
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('nm-1'), %L, 'Newbie', 'Ahmed', null)$$, (select uid from u)),
                 'P0001', 'last_name_invalid', 'a missing last name is refused at activation');
select throws_ok(format($$select private.redeem_staff_invitation(tests.th('nm-1'), %L, 'Newbie', E'Ah\nmed', 'Ali')$$, (select uid from u)),
                 'P0001', 'first_name_invalid', 'control characters are refused at activation');
select is((select state from public.staff_invitations where id = (select id from inv)), 'pending', 'a refused name consumes nothing');
select is(private.redeem_staff_invitation(tests.th('nm-1'), (select uid from u), 'Newbie', 'أحمد', 'علي') is not null, true,
          'Arabic names activate the account');
select is((select first_name || ' ' || last_name from public.tenant_staff where auth_user_id = (select uid from u)), 'أحمد علي',
          'both names are stored');

-- ---- context and directory -----------------------------------------------------------------------------------------
select is((public.svc_load_staff_context((select uid from u), gen_random_uuid())) ->> 'firstName', 'أحمد', 'the context carries the first name');
select is((public.svc_load_staff_context((select uid from u), gen_random_uuid())) ->> 'lastName', 'علي', 'the context carries the last name');
select is((public.svc_load_staff_context((select user_id from st where k='zed'), gen_random_uuid())) -> 'firstName', 'null'::jsonb,
          'no name yet: the context says null');
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select is((select jsonb_agg(x ->> 'username') from jsonb_array_elements(public.list_staff()) x), '["Manager", "Off", "Zed", "Newbie"]'::jsonb,
          'the directory is ordered by the shown name (username until a name is set)');
select is((public.get_staff((select id from public.tenant_staff where auth_user_id = (select uid from u)))) ->> 'lastName', 'علي',
          'get_staff carries the names');
select tests.reset();

-- ---- change_my_name ------------------------------------------------------------------------------------------------
select tests.claims((select user_id from st where k='zed'), (select sid from stale));
select tests.throws_ok($$select public.change_my_name('Zed', 'Zulu')$$, '42501', null, 'a revoked session cannot change the name');
select tests.claims((select user_id from st where k='zed'), null);
select tests.throws_ok($$select public.change_my_name('Zed', 'Zulu')$$, '42501', null, 'no session claim: denied');
select tests.claims((select user_id from st where k='off'), (select sid from st where k='off'));
select tests.throws_ok($$select public.change_my_name('Off', 'Line')$$, '42501', null, 'a disabled account cannot change the name');
select tests.reset();

select tests.claims((select user_id from st where k='zed'), (select sid from st where k='zed'));
select tests.throws_ok($$select public.change_my_name('', 'Zulu')$$, 'P0001', 'first_name_invalid', 'the first name is required');
select tests.throws_ok($$select public.change_my_name('Zed', ' ')$$, 'P0001', 'last_name_invalid', 'the last name is required');
select tests.throws_ok($$select public.change_my_name('Zed', null)$$, 'P0001', 'last_name_invalid', 'a name cannot be cleared');
select tests.lives_ok($$select public.change_my_name('Zed', 'Zulu')$$, 'a live session adds the names without any password');
select tests.lives_ok($$select public.change_my_name('Zed', 'Zulu')$$, 'saving the same names again is a no-op');
select tests.lives_ok($$select public.change_my_name('زياد', 'Zulu')$$, 'Arabic and Latin names can be mixed');
select tests.reset();
select is((select first_name || '|' || last_name from public.tenant_staff where id = (select staff_id from st where k='zed')), 'زياد|Zulu',
          'the caller''s row changed');
select is((select first_name from public.tenant_staff where id = (select staff_id from st where k='mgr')), null::text,
          'another staff member is untouched');
select is((select count(*)::int from public.tenant_audit_events where event = 'staff.name_changed'
           and actor_staff_id = (select staff_id from st where k='zed')), 2, 'each real change is audited once');
select is((select coalesce(metadata ->> 'oldFirstName', '-') || '>' || (metadata ->> 'newFirstName') from public.tenant_audit_events
           where event = 'staff.name_changed' order by id limit 1), '->Zed', 'audit records old and new values');

-- ---- privileges ----------------------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'public.change_my_name(text, text)', 'execute'), false, 'anon cannot change a name');
select is(has_function_privilege('authenticated', 'public.svc_redeem_staff_invitation(text, uuid, text, text, text)', 'execute'), false,
          'redemption stays service_role only');
select is((select count(*)::int from pg_proc p where p.proname = 'redeem_staff_invitation'), 1, 'the old three-argument redemption is gone');
