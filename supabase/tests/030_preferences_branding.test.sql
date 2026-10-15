-- T155 preferences and tenant branding (FR-035, FR-036, FR-039)
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('br-a') a, tests.mk_tenant('br-b') b;
create temp table pa as select tests.mk_user('root@br.test') uid, tests.mk_user('nocap@br.test') nocap_uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via)
  select uid, '{tenants.manage}'::text[], 'bootstrap' from pa
  union all select nocap_uid, '{platform_audit.view}'::text[], 'bootstrap' from pa;
create temp table ps as select tests.mk_psession((select uid from pa)) sid, tests.mk_psession((select nocap_uid from pa)) nocap_sid;
create temp table st (k text primary key, staff_id uuid, user_id uuid, sid uuid, tenant uuid);
insert into st select 'mgr', s.*, null, (select a from fx) from tests.mk_staff((select a from fx), 'Manager', 'mgr@br.test') s;
insert into st select 'staff', s.*, null, (select a from fx) from tests.mk_staff((select a from fx), 'Worker', 'worker@br.test') s;
insert into st select 'other', s.*, null, (select b from fx) from tests.mk_staff((select b from fx), 'Mgrb', 'mgrb@br.test') s;
insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
  select tenant, staff_id, (select uid from pa) from st where k in ('mgr', 'other');
update st set sid = tests.mk_session(user_id, tenant, staff_id);

-- preferences: own row only, validated, live session required
select tests.claims((select user_id from st where k='staff'), (select sid from st where k='staff'));
select is(public.get_my_preferences(), null::jsonb, 'no preference until one is chosen');
select tests.lives_ok($$select public.set_my_preferences('en', 'dark')$$, 'a staff member stores language and theme');
select is(public.get_my_preferences(), '{"locale":"en","theme_mode":"dark"}'::jsonb, 'stored values are returned');
select tests.lives_ok($$select public.set_my_preferences(null, 'light')$$, 'null keeps the other value');
select is(public.get_my_preferences(), '{"locale":"en","theme_mode":"light"}'::jsonb, 'only the theme changed');
select tests.throws_ok($$select public.set_my_preferences('fr', null)$$, 'P0001', 'preference_invalid', 'unknown locale rejected');
select tests.throws_ok($$select public.set_my_preferences(null, 'blue')$$, 'P0001', 'preference_invalid', 'unknown theme rejected');
select tests.claims((select user_id from st where k='other'), (select sid from st where k='other'));
select is(public.get_my_preferences(), null::jsonb, 'another tenant''s staff never sees this preference');
create temp table dead as select tests.mk_session(user_id, tenant, staff_id, now(), true) sid from st where k = 'staff';
select tests.claims((select user_id from st where k='staff'), (select sid from dead));
select tests.throws_ok($$select public.get_my_preferences()$$, '42501', null, 'a revoked session cannot read preferences');
select tests.throws_ok($$select public.set_my_preferences('ar', null)$$, '42501', null, 'a revoked session cannot write preferences');
select tests.reset();
select is((select count(*)::int from public.tenant_preferences where tenant_id = (select a from fx)), 1, 'exactly one preference row, scoped to its tenant');
select tests.act_as((select user_id from st where k='staff'), (select sid from st where k='staff'));
select tests.throws_ok($$select * from public.tenant_preferences$$, '42501', null, 'the table is not readable directly (RPC only)');
select tests.reset();

-- branding: manager only
select tests.claims((select user_id from st where k='staff'), (select sid from st where k='staff'));
select tests.throws_ok($$select public.update_tenant_branding('Hacked', null, false)$$, '42501', null, 'an ordinary staff member cannot change branding');
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select tests.throws_ok($$select public.update_tenant_branding('', null, false)$$, 'P0001', 'name_required', 'a name is required');
select tests.throws_ok($$select public.update_tenant_branding('<b>x</b>', null, false)$$, 'P0001', 'name_invalid', 'markup rejected');
select tests.throws_ok(format($$select public.update_tenant_branding('N', %L, false)$$, (select b from fx)::text || '/' || gen_random_uuid()::text || '.png'),
  'P0001', 'logo_invalid', 'a logo path under another tenant is rejected');
select tests.throws_ok($$select public.update_tenant_branding('N', 'x/../y.png', false)$$, 'P0001', 'logo_invalid', 'a malformed path is rejected');
create temp table res (k text primary key, v jsonb);
insert into res select 'name_only', public.update_tenant_branding('جمعية الأمل', null, false);
select is((select display_name from public.tenants where id = (select a from fx)), 'جمعية الأمل', 'the manager renames the organization');
select is((select (v->>'logoVersion')::int from res where k='name_only'), 0, 'logo version is unchanged without a logo change');
create temp table paths as select (select a from fx)::text || '/' || gen_random_uuid()::text || '.png' p1, (select a from fx)::text || '/' || gen_random_uuid()::text || '.webp' p2;
insert into res select 'add', public.update_tenant_branding('جمعية الأمل', (select p1 from paths), false);
select is((select v->>'logoVersion' from res where k='add'), '1', 'adding a logo increments the version');
select is((select v->'previousLogoPath' from res where k='add'), 'null'::jsonb, 'no previous object when adding');
insert into res select 'replace', public.update_tenant_branding('جمعية الأمل', (select p2 from paths), false);
select is((select v->>'previousLogoPath' from res where k='replace'), (select p1 from paths), 'replacing returns the previous object path for deletion');
insert into res select 'keep', public.update_tenant_branding('جمعية الأمل', null, false);
select is((select logo_object_path from public.tenants where id = (select a from fx)), (select p2 from paths), 'omitting the logo keeps it');
insert into res select 'remove', public.update_tenant_branding('جمعية الأمل', null, true);
select is((select logo_object_path from public.tenants where id = (select a from fx)), null::text, 'removal clears the logo');
select is((select v->>'logoVersion' from res where k='remove'), '3', 'every logo change increments the version');
select tests.reset();
select is((select display_name from public.tenants where id = (select b from fx)), 'Org br-b', 'the other tenant is untouched');
select ok(exists (select 1 from public.tenant_audit_events where tenant_id = (select a from fx) and category = 'tenant_settings'
                    and event = 'tenant.branding_updated' and actor_staff_id = (select staff_id from st where k='mgr')), 'branding changes are audited under tenant_settings');
select is((select count(*)::int from public.tenant_audit_events where event = 'tenant.branding_updated' and metadata::text ~ 'logo_object_path|\.png'), 0, 'audit metadata carries no object paths');

-- a delegate holding every grantable permission is still not the manager
select tests.mk_role((select a from fx), 'AllPerms');
insert into public.permission_grants (tenant_id, role_id, permission_key)
  select (select a from fx), (select id from public.roles where name = 'AllPerms' and tenant_id = (select a from fx)), key
  from public.permission_catalog where key like 'staff.%' or key like 'roles.%';
insert into public.staff_roles (tenant_id, staff_id, role_id)
  select (select a from fx), (select staff_id from st where k='staff'), (select id from public.roles where name = 'AllPerms' and tenant_id = (select a from fx));
select tests.claims((select user_id from st where k='staff'), (select sid from st where k='staff'));
select tests.throws_ok($$select public.update_tenant_branding('Still no', null, false)$$, '42501', null, 'broad delegated permissions never grant branding');
select tests.reset();

-- platform intervention
select tests.claims((select user_id from st where k='mgr'), (select sid from st where k='mgr'));
select tests.throws_ok(format($$select public.platform_update_tenant_logo(%L, null, true)$$, (select a from fx)), '42501', null, 'tenant managers cannot use the platform RPC');
select tests.claims((select nocap_uid from pa), (select nocap_sid from ps));
select tests.throws_ok(format($$select public.platform_update_tenant_logo(%L, null, true)$$, (select a from fx)), '42501', null, 'a platform admin without tenants.manage is denied');
select tests.claims((select uid from pa), (select sid from ps));
select tests.throws_ok(format($$select public.platform_update_tenant_logo(%L, %L, false)$$, (select a from fx), (select b from fx)::text || '/' || gen_random_uuid()::text || '.png'),
  'P0001', 'logo_invalid', 'a path under another tenant is rejected');
select tests.throws_ok($$select public.platform_update_tenant_logo(gen_random_uuid(), null, true)$$, 'P0001', 'tenant_not_found', 'unknown tenant');
insert into res select 'plat', public.platform_update_tenant_logo((select a from fx), (select p1 from paths), false);
select is((select v->>'logoVersion' from res where k='plat'), '4', 'the platform sets a logo and the version increments');
select is((select (public.platform_get_tenant((select a from fx)))->>'has_logo'), 'true', 'platform_get_tenant reports the logo (metadata only)');
select tests.reset();
select ok(exists (select 1 from public.platform_audit_events where event = 'tenant.logo_updated' and metadata->>'tenantId' = (select a from fx)::text), 'intervention audited on the platform side');
select ok(exists (select 1 from public.tenant_audit_events where tenant_id = (select a from fx) and event = 'tenant.logo_updated' and actor_platform_admin_id = (select uid from pa)), 'and on the tenant side');

-- helpers are not callable by clients
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname in ('valid_tenant_display_name', 'valid_logo_path')
             and has_function_privilege('authenticated', p.oid, 'EXECUTE')), 0, 'validation helpers are not executable by authenticated');
