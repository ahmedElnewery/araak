select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('ceil-a') a, tests.mk_tenant('ceil-b') b;
create temp table padm as select tests.mk_user('root@ceil.test') uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via) select uid, '{tenants.managers.manage}', 'bootstrap' from padm;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid);
insert into st select 'mgr', s.*, null from tests.mk_staff((select a from fx), 'mgr', 'mgr@ceil.test') s;
insert into st select 'del', s.*, null from tests.mk_staff((select a from fx), 'del', 'del@ceil.test') s;
insert into st select 'none', s.*, null from tests.mk_staff((select a from fx), 'none', 'none@ceil.test') s;
update st set sid = tests.mk_session(user_id, (select a from fx), staff_id);
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select (select a from fx), staff_id, (select uid from padm) from st where k = 'mgr';

-- delegated role: roles.update + roles.create + audit_logs.view{staff,roles}
create temp table rl as select tests.mk_role((select a from fx), 'Delegate') del,
  tests.mk_role((select a from fx), 'Disabler') disabler, tests.mk_role((select a from fx), 'Roleonly') roleonly,
  tests.mk_role((select a from fx), 'Auditor') auditor, tests.mk_role((select a from fx), 'Archived') archived,
  tests.mk_role((select b from fx), 'Foreign') foreign_role;
insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories) values
  ((select a from fx), (select del from rl), 'roles.update', null),
  ((select a from fx), (select del from rl), 'roles.create', null),
  ((select a from fx), (select del from rl), 'audit_logs.view', '{staff,roles}'),
  ((select a from fx), (select disabler from rl), 'staff.disable', null),
  ((select a from fx), (select roleonly from rl), 'roles.update', null),
  ((select a from fx), (select auditor from rl), 'audit_logs.view', '{staff}'),
  ((select a from fx), (select archived from rl), 'roles.update', null),
  ((select b from fx), (select foreign_role from rl), 'staff.view', null);
update public.roles set archived_at = now() where id = (select archived from rl);
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), staff_id, (select del from rl) from st where k = 'del';

create function tests.can(p_who text, p_key text, p_scope public.record_scope default 'all', p_cats text[] default null) returns boolean
language plpgsql as $$
declare r boolean;
begin
  perform tests.claims((select user_id from st where k = p_who), (select sid from st where k = p_who));
  select private.actor_can_grant(p_key, p_scope, p_cats) into r;
  perform tests.reset();
  return r;
end $$;
create function tests.can_role(p_who text, p_role uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform tests.claims((select user_id from st where k = p_who), (select sid from st where k = p_who));
  select private.actor_can_grant_role(p_role) into r;
  perform tests.reset();
  return r;
end $$;

-- manager
select is(tests.can('mgr', 'staff.disable'), true, 'manager may grant any grantable key');
select is(tests.can('mgr', 'roles.restore'), true, 'manager may grant roles.restore');
select is(tests.can('mgr', 'tenant.branding.edit'), false, 'manager cannot grant branding (manager-only)');
select is(tests.can('mgr', 'security_logs.view'), false, 'manager cannot grant Security Log access');
select is(tests.can('mgr', 'staff.invitation.resend'), false, 'manager cannot grant invitation resend');
select is(tests.can('mgr', 'staff.password.reset'), false, 'manager cannot grant password reset');
select is(tests.can('mgr', 'no.such.key'), false, 'unknown key refused');
select is(tests.can('mgr', 'staff.view', 'own'), false, 'unsupported scope refused');
select is(tests.can('mgr', 'audit_logs.view', 'all', '{staff,sessions}'), true, 'manager may grant audit categories');
select is(tests.can('mgr', 'audit_logs.view', 'all', null), false, 'audit grant needs categories');
select is(tests.can('mgr', 'audit_logs.view', 'all', '{}'), false, 'audit grant needs a non-empty category list');
select is(tests.can('mgr', 'audit_logs.view', 'all', '{bogus}'), false, 'unknown audit category refused');
select is(tests.can('mgr', 'staff.view', 'all', '{staff}'), false, 'categories only allowed on audit_logs.view');

-- delegate (holds roles.update, roles.create, audit_logs.view{staff,roles})
select is(tests.can('del', 'roles.update'), true, 'delegate may grant what they hold (roles.update)');
select is(tests.can('del', 'roles.create'), true, 'delegate may grant roles.create');
select is(tests.can('del', 'staff.disable'), false, 'delegate may NOT grant a key they lack');
select is(tests.can('del', 'roles.restore'), false, 'delegate may NOT grant roles.restore');
select is(tests.can('del', 'tenant.branding.edit'), false, 'delegate may NOT grant manager-only authority');
select is(tests.can('del', 'audit_logs.view', 'all', '{staff}'), true, 'delegate may grant a subset of their audit categories');
select is(tests.can('del', 'audit_logs.view', 'all', '{staff,roles}'), true, 'delegate may grant exactly their audit categories');
select is(tests.can('del', 'audit_logs.view', 'all', '{staff,sessions}'), false, 'delegate may NOT grant an audit category they lack');
select is(tests.can('none', 'roles.update'), false, 'staff without roles may grant nothing');

-- whole roles
select is(tests.can_role('mgr', (select disabler from rl)), true, 'manager may confer a role of any grantable keys');
select is(tests.can_role('del', (select roleonly from rl)), true, 'delegate may confer a role within their authority');
select is(tests.can_role('del', (select disabler from rl)), false, 'delegate may NOT confer a role above their authority');
select is(tests.can_role('del', (select auditor from rl)), true, 'delegate may confer a role with a subset audit grant');
select is(tests.can_role('mgr', (select archived from rl)), false, 'an archived role cannot be conferred');
select is(tests.can_role('mgr', (select foreign_role from rl)), false, 'a role of another tenant cannot be conferred');
select is(tests.can_role('none', (select roleonly from rl)), false, 'staff without authority cannot confer roles');

-- context gating
update public.tenant_staff set enabled = false where id = (select staff_id from st where k = 'mgr');
select is(tests.can('mgr', 'roles.update'), false, 'a disabled manager may grant nothing');
update public.tenant_staff set enabled = true where id = (select staff_id from st where k = 'mgr');
update public.tenants set state = 'suspended' where id = (select a from fx);
select is(tests.can('del', 'roles.update'), false, 'in a suspended tenant nobody may grant');
update public.tenants set state = 'active' where id = (select a from fx);
select private.revoke_sessions(array[(select sid from st where k = 'del')], 'sign_out');
select is(tests.can('del', 'roles.update'), false, 'a revoked session may grant nothing');
select is(tests.can('mgr', 'roles.update'), true, 'other sessions are unaffected');

-- revoked manager authority
update public.tenant_manager_grants set revoked_at = now(), revoked_by_platform_admin = (select uid from padm);
select is(tests.can('mgr', 'staff.disable'), false, 'a demoted manager (no roles) loses the ceiling');
