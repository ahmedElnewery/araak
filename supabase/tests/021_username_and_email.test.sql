-- T098 username change and immutable email (FR-010, FR-011, CL-011, CL-012)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('un-a') a, tests.mk_tenant('un-b') b;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'alice', s.*, null from tests.mk_staff((select a from fx), 'Alice', 'alice@un.test') s;
insert into st select 'bob', s.*, null from tests.mk_staff((select a from fx), 'Bob', 'bob@un.test') s;
insert into st select 'other', s.*, null from tests.mk_staff((select b from fx), 'Carol', 'carol@un.test') s;
insert into st select 'off', s.*, null from tests.mk_staff((select a from fx), 'Dave', 'dave@un.test', false) s;
update st set sid = tests.mk_session(user_id, case when k = 'other' then (select b from fx) else (select a from fx) end, staff_id);
create temp table stale as select tests.mk_session(user_id, (select a from fx), staff_id, now(), true) sid from st where k = 'alice';

-- live session required
select tests.claims((select user_id from st where k='alice'), (select sid from stale));
select tests.throws_ok($$select public.change_my_username('Alicia')$$, '42501', null, 'a revoked session cannot change the username');
select tests.claims((select user_id from st where k='alice'), null);
select tests.throws_ok($$select public.change_my_username('Alicia')$$, '42501', null, 'no session claim: denied');
select tests.claims((select user_id from st where k='off'), (select sid from st where k='off'));
select tests.throws_ok($$select public.change_my_username('Davey')$$, '42501', null, 'a disabled account cannot change the username');
select tests.reset();

select tests.claims((select user_id from st where k='alice'), (select sid from st where k='alice'));
select tests.lives_ok($$select public.change_my_username('Alicia')$$, 'live session changes the username without any password');
select tests.throws_ok($$select public.change_my_username('BOB')$$, 'P0001', 'username_taken', 'case-insensitive uniqueness inside the tenant');
select tests.throws_ok($$select public.change_my_username('ab')$$, 'P0001', 'username_invalid', 'too short');
select tests.throws_ok($$select public.change_my_username('_alice')$$, 'P0001', 'username_invalid', 'placement');
select tests.throws_ok($$select public.change_my_username('ali1ce')$$, 'P0001', 'username_invalid', 'charset');
select tests.lives_ok($$select public.change_my_username('ALICIA')$$, 'changing only the case of one''s own name is allowed');
select tests.lives_ok($$select public.change_my_username('Carol')$$, 'the same name used in another tenant is allowed');
select tests.reset();
select is((select username from public.tenant_staff where id = (select staff_id from st where k='alice')), 'Carol', 'the caller''s row changed');
select is((select username from public.tenant_staff where id = (select staff_id from st where k='bob')), 'Bob', 'another staff member in the tenant is untouched');
select is((select username from public.tenant_staff where id = (select staff_id from st where k='other')), 'Carol', 'a staff member of the other tenant is untouched');
select is((select count(*)::int from public.tenant_audit_events where event = 'staff.username_changed' and actor_staff_id = (select staff_id from st where k='alice')), 3, 'each change is audited');
select is((select metadata->>'oldUsername' || '>' || (metadata->>'newUsername') from public.tenant_audit_events
           where event = 'staff.username_changed' order by id limit 1), 'Alice>Alicia', 'audit records old and new values');
select is((select count(*)::int from pg_proc p where p.proname = 'change_my_username' and p.pronargs = 1), 1, 'the RPC takes exactly one parameter (no password)');

-- email is immutable
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname ~* '(change|update|set|edit).*email'), 0, 'no RPC changes an email');
select throws_ok($$update public.tenant_staff set email = 'x@un.test', email_normalized = 'x@un.test' where username = 'Bob'$$, 'P0001', 'staff_identity_immutable', 'tenant_staff email cannot change');
select throws_ok(format($$update auth.users set email = 'new@un.test' where id = %L$$, (select user_id from st where k='bob')), 'P0001', 'staff_email_immutable', 'auth.users email blocked for linked staff');
select throws_ok(format($$update auth.users set email_change = 'new@un.test' where id = %L$$, (select user_id from st where k='bob')), 'P0001', 'staff_email_immutable', 'auth.users email_change blocked for linked staff');
select lives_ok(format($$update auth.users set encrypted_password = 'x' where id = %L$$, (select user_id from st where k='bob')), 'password changes still work for linked staff');
create temp table loose as select tests.mk_user('loose@un.test') uid;
select lives_ok(format($$update auth.users set email = 'loose2@un.test' where id = %L$$, (select uid from loose)), 'identities not linked to staff are unaffected');
