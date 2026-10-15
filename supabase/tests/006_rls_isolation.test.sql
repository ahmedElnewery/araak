select tests.no_plan();
select tests.open_tap();

-- two tenants, platform admin, staff with different authority
create temp table fx as select tests.mk_tenant('iso-a') a, tests.mk_tenant('iso-b') b;
create temp table st (k text primary key, staff_id uuid, user_id uuid);
insert into st select 'amgr',   * from tests.mk_staff((select a from fx), 'amgr',   'amgr@iso.test');
insert into st select 'aview',  * from tests.mk_staff((select a from fx), 'aview',  'aview@iso.test');
insert into st select 'aplain', * from tests.mk_staff((select a from fx), 'aplain', 'aplain@iso.test');
insert into st select 'bmgr',   * from tests.mk_staff((select b from fx), 'bmgr',   'bmgr@iso.test');
insert into st select 'bview',  * from tests.mk_staff((select b from fx), 'bview',  'bview@iso.test');
create function tests.u(p_k text) returns uuid language sql stable as $$ select user_id from st where st.k = p_k $$;
create function tests.sf(p_k text) returns uuid language sql stable as $$ select staff_id from st where st.k = p_k $$;
create temp table ses (k text primary key, sid uuid);
insert into ses select k, tests.mk_session(user_id, (select a from fx), staff_id) from st where k like 'a%';
insert into ses select k, tests.mk_session(user_id, (select b from fx), staff_id) from st where k like 'b%';
create function tests.se(p_k text) returns uuid language sql stable as $$ select sid from ses where ses.k = p_k $$;
create temp table roles_t as select
  tests.mk_role((select a from fx), 'A viewers') ra, tests.mk_role((select b from fx), 'B viewers') rb;
create temp table padm as select tests.mk_user('root@iso.test') uid;
grant all on fx, st, ses, roles_t, padm to public;
create function tests.denied_as(p_user uuid, p_session uuid, p_sql text) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform tests.act_as(p_user, p_session);
  begin
    execute p_sql;
    r := false;
  exception when insufficient_privilege then r := true;
  end;
  perform tests.reset();
  return r;
end $$;
grant execute on all functions in schema tests to public;

insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage,tenants.managers.manage}', 'bootstrap' from padm;
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select a from fx), tests.sf('amgr'), uid from padm;
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select b from fx), tests.sf('bmgr'), uid from padm;
insert into public.permission_grants (tenant_id, role_id, permission_key) values
  ((select a from fx), (select ra from roles_t), 'staff.view'), ((select a from fx), (select ra from roles_t), 'roles.view'),
  ((select b from fx), (select rb from roles_t), 'staff.view'), ((select b from fx), (select rb from roles_t), 'roles.view');
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), tests.sf('aview'), (select ra from roles_t);
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select b from fx), tests.sf('bview'), (select rb from roles_t);
insert into public.session_registry (provider_session_id, auth_user_id, platform_admin_id, verified_activity_at)
  select gen_random_uuid(), uid, uid, now() from padm;
insert into storage.objects (bucket_id, name) values
  ('tenant-private', (select a::text from fx) || '/doc.txt'), ('tenant-private', (select b::text from fx) || '/doc.txt');

-- count rows visible to a user, or -1 when the role has no privilege at all
create function tests.seen(p_user uuid, p_session uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform tests.act_as(p_user, p_session);
  begin
    execute format('select count(*) from (%s) q', p_sql) into n;
  exception when insufficient_privilege then n := -1;
  end;
  perform tests.reset();
  return n;
end $$;
create function tests.seen_anon(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform tests.act_anon();
  begin
    execute format('select count(*) from (%s) q', p_sql) into n;
  exception when insufficient_privilege then n := -1;
  end;
  perform tests.reset();
  return n;
end $$;
grant execute on all functions in schema tests to public;

-- ===== anon =====
select is(tests.seen_anon('select 1 from public.tenants'), -1::bigint, 'anon: tenants not accessible');
select is(tests.seen_anon('select 1 from public.tenant_staff'), -1::bigint, 'anon: tenant_staff not accessible');
select is(tests.seen_anon('select 1 from public.session_registry'), -1::bigint, 'anon: session_registry not accessible');

-- ===== ordinary staff of tenant A (no permissions) =====
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.tenant_staff'), 1::bigint, 'plain A: sees only own staff row');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.tenants'), 1::bigint, 'plain A: sees only own tenant');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.roles'), 0::bigint, 'plain A: no roles without roles.view');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.session_registry'), 1::bigint, 'plain A: sees only own session');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.platform_admins'), 0::bigint, 'plain A: no platform admins');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.email_reservations'), -1::bigint, 'plain A: reservations not accessible');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.tenant_audit_events'), -1::bigint, 'plain A: audit not accessible');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.permission_catalog'), -1::bigint, 'plain A: catalog not accessible directly');

-- ===== staff.view + roles.view holder in A =====
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.tenant_staff'), 3::bigint, 'view A: sees exactly the 3 staff of tenant A');
select is(tests.seen(tests.u('aview'), tests.se('aview'), format('select 1 from public.tenant_staff where tenant_id = %L', (select b from fx))), 0::bigint, 'view A: sees no tenant-B staff');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.roles'), 1::bigint, 'view A: sees tenant-A roles only');
select is(tests.seen(tests.u('aview'), tests.se('aview'), format('select 1 from public.roles where id = %L', (select rb from roles_t))), 0::bigint, 'view A: cannot read the tenant-B role by id');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.permission_grants'), 2::bigint, 'view A: sees only tenant-A grants');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.staff_roles'), 1::bigint, 'view A: sees only tenant-A memberships');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.session_registry'), 1::bigint, 'view A: sessions of others stay invisible');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.tenants'), 1::bigint, 'view A: sees one tenant');

-- ===== implicit manager of A =====
select is(tests.seen(tests.u('amgr'), tests.se('amgr'), 'select 1 from public.tenant_staff'), 3::bigint, 'manager A: sees A staff');
select is(tests.seen(tests.u('amgr'), tests.se('amgr'), format('select 1 from public.tenant_staff where tenant_id = %L', (select b from fx))), 0::bigint, 'manager A: never sees B staff');
select is(tests.seen(tests.u('amgr'), tests.se('amgr'), 'select 1 from public.roles'), 1::bigint, 'manager A: sees A roles');
select is(tests.seen(tests.u('amgr'), tests.se('amgr'), 'select 1 from public.tenant_manager_grants'), -1::bigint, 'manager A: manager grants are not client-readable');

-- ===== tenant B mirrors =====
select is(tests.seen(tests.u('bview'), tests.se('bview'), 'select 1 from public.tenant_staff'), 2::bigint, 'view B: sees exactly the 2 staff of tenant B');
select is(tests.seen(tests.u('bview'), tests.se('bview'), format('select 1 from public.tenant_staff where tenant_id = %L', (select a from fx))), 0::bigint, 'view B: sees no tenant-A staff');

-- ===== wrong/foreign session =====
select is(tests.seen(tests.u('aview'), tests.se('bview'), 'select 1 from public.tenant_staff'), 0::bigint, 'A user presenting a B session sees nothing');
select is(tests.seen(tests.u('aview'), null, 'select 1 from public.tenant_staff'), 0::bigint, 'no session_id claim: nothing');
select is(tests.seen(tests.u('aview'), gen_random_uuid(), 'select 1 from public.tenant_staff'), 0::bigint, 'unregistered session: nothing');

-- ===== lifecycle: revoke / disable / suspend / stale =====
select private.revoke_sessions(array[tests.se('aview')], 'sign_out');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.tenant_staff'), 0::bigint, 'revoked session: tenant_staff empty');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.roles'), 0::bigint, 'revoked session: roles empty');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.session_registry'), 0::bigint, 'revoked session: registry empty');
select is(tests.seen(tests.u('aview'), tests.se('aview'), 'select 1 from public.tenants'), 0::bigint, 'revoked session: tenants empty');

update public.tenant_staff t set enabled = false from st where t.id = tests.sf('bview');
select is(tests.seen(tests.u('bview'), tests.se('bview'), 'select 1 from public.tenant_staff'), 0::bigint, 'disabled staff: sees nothing');

update public.tenants set state = 'suspended' where id = (select a from fx);
select is(tests.seen(tests.u('amgr'), tests.se('amgr'), 'select 1 from public.tenant_staff'), 0::bigint, 'suspended tenant: even the manager sees nothing');
select is(tests.seen(tests.u('bmgr'), tests.se('bmgr'), 'select 1 from public.tenant_staff'), 2::bigint, 'suspension of A does not affect B');
update public.tenants set state = 'active' where id = (select a from fx);

update public.session_registry set verified_activity_at = now() - interval '31 days' where provider_session_id = tests.se('aplain');
select is(tests.seen(tests.u('aplain'), tests.se('aplain'), 'select 1 from public.tenant_staff'), 0::bigint, 'inactive >30 days: sees nothing');

-- archived role grants stop counting
update public.roles set archived_at = now() where id = (select rb from roles_t);
update public.tenant_staff t set enabled = true from st where t.id = tests.sf('bview');
select is(tests.seen(tests.u('bview'), tests.se('bview'), 'select 1 from public.tenant_staff'), 1::bigint, 'archived role: staff.view lost, only own row remains');

-- ===== writes are impossible from the client roles =====
select ok(tests.denied_as(tests.u('bmgr'), tests.se('bmgr'), 'update public.tenant_staff set enabled = false'), 'manager B: direct UPDATE denied');
select ok(tests.denied_as(tests.u('bmgr'), tests.se('bmgr'), 'delete from public.roles'), 'manager B: direct DELETE denied');
select ok(tests.denied_as(tests.u('bmgr'), tests.se('bmgr'), 'insert into public.roles (tenant_id, name) values (gen_random_uuid(), ''x'')'), 'manager B: direct INSERT denied');
select is(tests.seen(tests.u('bmgr'), tests.se('bmgr'), 'select private.revoke_sessions(array[gen_random_uuid()], ''user'')'), -1::bigint, 'client cannot call revoke_sessions');
select is(tests.seen(tests.u('bmgr'), tests.se('bmgr'), 'select private.claim_email_reservation(gen_random_uuid(), ''a@b.c'', gen_random_uuid(), now())'), -1::bigint, 'client cannot call claim_email_reservation');

-- ===== platform admin has no tenant data access =====
select is(tests.seen((select uid from padm), (select provider_session_id from public.session_registry where platform_admin_id = (select uid from padm)),
  'select 1 from public.platform_admins'), 1::bigint, 'platform admin: sees only own admin row');
select is(tests.seen((select uid from padm), (select provider_session_id from public.session_registry where platform_admin_id = (select uid from padm)),
  'select 1 from public.tenant_staff'), 0::bigint, 'platform admin: no tenant staff via RLS');
select is(tests.seen((select uid from padm), (select provider_session_id from public.session_registry where platform_admin_id = (select uid from padm)),
  'select 1 from public.roles'), 0::bigint, 'platform admin: no tenant roles via RLS');
select is(tests.seen((select uid from padm), (select provider_session_id from public.session_registry where platform_admin_id = (select uid from padm)),
  'select 1 from public.tenants'), 0::bigint, 'platform admin: tenants only via platform RPCs');

-- ===== storage =====
select is(tests.seen(tests.u('amgr'), tests.se('amgr'), $q$select 1 from storage.objects where bucket_id = 'tenant-private'$q$), 1::bigint, 'storage: A sees only its own folder');
select is(tests.seen(tests.u('bmgr'), tests.se('bmgr'), $q$select 1 from storage.objects where bucket_id = 'tenant-private'$q$), 1::bigint, 'storage: B sees only its own folder');
select is(tests.seen_anon($q$select 1 from storage.objects where bucket_id in ('tenant-private','tenant-logos')$q$), 0::bigint, 'storage: anon sees nothing');
