select tests.no_plan();
select tests.open_tap();

create temp table fx as select
  tests.mk_tenant('tenant-a') a, tests.mk_tenant('tenant-b') b;
grant all on fx to public;
create temp table sa as select * from tests.mk_staff((select a from fx), 'alice', 'Alice@A.test');
create temp table sb as select * from tests.mk_staff((select b from fx), 'bob', 'bob@b.test');
create temp table ra as select tests.mk_role((select a from fx), 'Role A') id;
create temp table rb as select tests.mk_role((select b from fx), 'Role B') id;

-- composite FKs
select throws_ok(format($q$insert into public.staff_roles (tenant_id, staff_id, role_id) values (%L, %L, %L)$q$,
  (select a from fx), (select staff_id from sa), (select id from rb)), '23503', null,
  'tenant-A staff cannot be linked to a tenant-B role');
select throws_ok(format($q$insert into public.staff_roles (tenant_id, staff_id, role_id) values (%L, %L, %L)$q$,
  (select b from fx), (select staff_id from sa), (select id from rb)), '23503', null,
  'tenant-B membership cannot reference tenant-A staff');
select lives_ok(format($q$insert into public.staff_roles (tenant_id, staff_id, role_id) values (%L, %L, %L)$q$,
  (select a from fx), (select staff_id from sa), (select id from ra)), 'same-tenant membership works');
select throws_ok(format($q$insert into public.permission_grants (tenant_id, role_id, permission_key) values (%L, %L, 'staff.view')$q$,
  (select a from fx), (select id from rb)), '23503', null, 'grant cannot mix tenant A with role of tenant B');

-- tenants immutability and subdomain rules
select throws_ok(format($q$update public.tenants set subdomain = 'other' where id = %L$q$, (select a from fx)),
  'P0001', 'tenant_identity_immutable', 'subdomain cannot change');
select throws_ok(format($q$update public.tenants set id = gen_random_uuid() where id = %L$q$, (select a from fx)),
  'P0001', 'tenant_identity_immutable', 'tenant id cannot change');
select lives_ok(format($q$update public.tenants set state = 'suspended' where id = %L$q$, (select a from fx)), 'state may change');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('x', 'admin')$q$, 'P0001', 'subdomain_reserved', 'reserved subdomain rejected');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('x', 'send')$q$, 'P0001', 'subdomain_reserved', 'mail-provider label is reserved');
select ok(not exists (select 1 from private.reserved_subdomains where name = 'portal'), 'portal is a tenant label, not reserved');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('x', 'Upper')$q$, '23514', null, 'uppercase subdomain rejected');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('x', '-lead')$q$, '23514', null, 'leading hyphen rejected');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('x', 'trail-')$q$, '23514', null, 'trailing hyphen rejected');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('x', 'a.b')$q$, '23514', null, 'dots rejected');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('   ', 'okname')$q$, '23514', null, 'blank display name rejected');
select throws_ok($q$insert into public.tenants (display_name, subdomain) values ('x', 'tenant-a')$q$, '23505', null, 'duplicate subdomain rejected');
select throws_ok(format($q$delete from public.tenants where id = %L$q$, (select b from fx)), '23503', null, 'tenant with staff cannot be deleted');

-- staff immutability
select throws_ok(format($q$update public.tenant_staff set email = 'new@a.test', email_normalized = 'new@a.test' where id = %L$q$, (select staff_id from sa)),
  'P0001', 'staff_identity_immutable', 'staff email cannot change');
select throws_ok(format($q$update public.tenant_staff set tenant_id = %L where id = %L$q$, (select b from fx), (select staff_id from sa)),
  'P0001', 'staff_identity_immutable', 'staff tenant cannot change');
select lives_ok(format($q$update public.tenant_staff set enabled = false where id = %L$q$, (select staff_id from sa)), 'staff can be disabled');

-- username rules
create function pg_temp.try_username(u text) returns boolean language plpgsql as $$
begin
  perform tests.mk_staff((select b from fx), u, 'u' || md5(u || clock_timestamp()::text) || '@u.test');
  return true;
exception when others then return false; end $$;
select is(pg_temp.try_username('ab'), false, 'length 2 fails');
select is(pg_temp.try_username(repeat('a', 31)), false, 'length 31 fails');
select is(pg_temp.try_username('abc'), true, 'length 3 passes');
select is(pg_temp.try_username(repeat('a', 30)), true, 'length 30 passes');
select is(pg_temp.try_username('ahmed'), true, 'ahmed passes');
select is(pg_temp.try_username('ahmed_ali'), true, 'ahmed_ali passes');
select is(pg_temp.try_username('ahmed.ali'), true, 'ahmed.ali passes');
select is(pg_temp.try_username('ahmed123'), false, 'digits fail');
select is(pg_temp.try_username('أحمد'), false, 'Arabic fails');
select is(pg_temp.try_username('ahmed ali'), false, 'space fails');
select is(pg_temp.try_username('ahmed-ali'), false, 'hyphen fails');
select is(pg_temp.try_username('.ahmed'), false, 'leading dot fails');
select is(pg_temp.try_username('ahmed.'), false, 'trailing dot fails');
select is(pg_temp.try_username('ahmed..ali'), false, 'double dot fails');
select is(pg_temp.try_username('ahmed__ali'), false, 'double underscore fails');
select is(pg_temp.try_username('ahmed._ali'), false, 'dot-underscore fails');

-- username case-insensitive per tenant, independent across tenants
select throws_ok(format($q$select tests.mk_staff(%L, 'ALICE', 'other@a.test')$q$, (select a from fx)), '23505', null,
  'Alice/ALICE cannot coexist in one tenant');
select lives_ok(format($q$select tests.mk_staff(%L, 'ALICE', 'alice@b.test')$q$, (select b from fx)),
  'same username may exist in another tenant');

-- global email uniqueness (disabled staff included; case variants)
select throws_ok(format($q$select tests.mk_staff(%L, 'carol', ' ALICE@a.TEST ')$q$, (select b from fx)), '23505', null,
  'same email in another tenant is rejected (alice is disabled and still reserves it)');
select throws_ok(format($q$select tests.mk_staff(%L, 'dave', 'bob@b.test')$q$, (select b from fx)), '23505', null,
  'same email in the same tenant is rejected');
select throws_ok(format($q$insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, activated_at)
  values (%L, %L, 'X@x.test', 'X@x.test', 'xavier', now())$q$, (select a from fx), (select user_id from sa)), 'P0001', 'auth_identity_mismatch',
  'a non-normalized (or mismatching) email_normalized is rejected');
select throws_ok(format($q$insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, activated_at)
  values (%L, %L, 'zed@z.test', 'zed@z.test', 'zed', now())$q$, (select a from fx), tests.mk_user('someone-else@z.test')),
  'P0001', 'auth_identity_mismatch', 'staff row must match its Auth identity email');

-- platform admin vs staff collision
select throws_ok(format($q$insert into public.platform_admins (auth_user_id, capabilities, created_via) values (%L, '{tenants.manage}', 'bootstrap')$q$,
  (select user_id from sb)), 'P0001', 'identity_unavailable', 'a tenant staff identity cannot become a platform admin');
select throws_ok($q$insert into public.platform_admins (auth_user_id, capabilities, created_via) values (gen_random_uuid(), '{bogus}', 'bootstrap')$q$,
  '23514', null, 'unknown platform capability rejected');
select lives_ok($q$insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select tests.mk_user('root@p.test'), '{tenants.manage}', 'bootstrap'$q$, 'platform admin creation works');
select throws_ok($q$insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, activated_at)
  select (select a from fx), u.id, u.email, u.email, 'rooty', now() from auth.users u where u.email = 'root@p.test'$q$,
  'P0001', 'identity_unavailable', 'a platform admin identity cannot become tenant staff');

-- RBAC guards
select throws_ok(format($q$insert into public.permission_grants (tenant_id, role_id, permission_key) values (%L, %L, 'tenant.branding.edit')$q$,
  (select a from fx), (select id from ra)), 'P0001', 'permission_not_grantable', 'manager-only authority cannot be granted to a role');
select throws_ok(format($q$insert into public.permission_grants (tenant_id, role_id, permission_key, scope) values (%L, %L, 'staff.view', 'own')$q$,
  (select a from fx), (select id from ra)), 'P0001', 'scope_not_supported', 'unsupported scope rejected');
select throws_ok(format($q$insert into public.permission_grants (tenant_id, role_id, permission_key) values (%L, %L, 'audit_logs.view')$q$,
  (select a from fx), (select id from ra)), '23514', null, 'audit grant requires categories');
select throws_ok(format($q$insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values (%L, %L, 'staff.view', '{staff}')$q$,
  (select a from fx), (select id from ra)), '23514', null, 'categories only allowed for audit_logs.view');
select throws_ok(format($q$insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values (%L, %L, 'audit_logs.view', '{nonsense}')$q$,
  (select a from fx), (select id from ra)), '23514', null, 'unknown audit category rejected');
select lives_ok(format($q$insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values (%L, %L, 'audit_logs.view', '{staff,roles}')$q$,
  (select a from fx), (select id from ra)), 'valid audit grant works');
select lives_ok(format($q$update public.roles set archived_at = now() where id = %L$q$, (select id from rb)), 'role can be archived');
select throws_ok(format($q$insert into public.staff_roles (tenant_id, staff_id, role_id) values (%L, %L, %L)$q$,
  (select b from fx), (select staff_id from sb), (select id from rb)), 'P0001', 'role_archived', 'archived role cannot be assigned');
select lives_ok(format($q$select tests.mk_role(%L, 'Role B')$q$, (select b from fx)), 'archived role name is reusable');
select throws_ok(format($q$select tests.mk_role(%L, ' role a ')$q$, (select a from fx)), '23505', null, 'active role names are unique per tenant (case/space-insensitive)');
select lives_ok(format($q$select tests.mk_role(%L, 'Role A')$q$, (select b from fx)), 'same role name allowed in another tenant');

-- session registry owner rule
select throws_ok(format($q$insert into public.session_registry (provider_session_id, auth_user_id, verified_activity_at) values (gen_random_uuid(), %L, now())$q$,
  (select user_id from sa)), '23514', null, 'session must have exactly one owner kind');
select throws_ok(format($q$insert into public.session_registry (provider_session_id, auth_user_id, tenant_id, staff_id, verified_activity_at)
  values (gen_random_uuid(), %L, %L, %L, now())$q$, (select user_id from sa), (select b from fx), (select staff_id from sa)),
  '23503', null, 'session cannot pair tenant B with tenant-A staff');
