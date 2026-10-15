select tests.no_plan();
select tests.open_tap();

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and not (c.relrowsecurity and c.relforcerowsecurity)),
          0, 'every public table has RLS enabled and forced');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'private' and c.relkind in ('r', 'p') and not (c.relrowsecurity and c.relforcerowsecurity)),
          0, 'every private table has RLS enabled and forced');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace,
           unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
           where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, p)),
          0, 'anon has no privilege on any public table');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace,
           unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
           where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, p)),
          0, 'authenticated has no write privilege on any public table (mutations go through RPCs)');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'SELECT')
             and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
          0, 'every table readable by authenticated has at least one policy');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'private' and c.relkind in ('r', 'p')
             and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))),
          0, 'private tables are not readable by anon/authenticated');

select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
          null::text[], 'every SECURITY DEFINER function has a fixed search_path');

select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'EXECUTE')),
          null::text[], 'no private function is executable by anon');

select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
             and p.proname <> all (array['current_staff_id','current_tenant_id','request_context_ok','my_role_ids',
               'has_permission','is_active_tenant_manager','audit_categories_for_actor','platform_context_ok',
               'is_platform_admin','current_session_is_live','has_permission_for_record'])),
          null::text[], 'private functions executable by authenticated are exactly the allowlisted RLS helpers');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
             and p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and p.oid not in (select d.objid from pg_depend d where d.deptype = 'e')),
          0, 'anon cannot execute any application function in public');

select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no USAGE on schema private');
select ok(not exists (select 1 from storage.buckets where id in ('tenant-logos', 'tenant-private') and public),
          'tenant storage buckets are private');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and 'anon' = any (roles)),
          0, 'no storage.objects policy grants anon access');

select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
             and p.proname <> all (array['my_effective_permissions',
               'platform_create_tenant','platform_set_tenant_state','platform_update_tenant_name','platform_list_tenants',
               'platform_get_tenant','platform_get_tenant_managers','platform_grant_tenant_manager',
               'platform_invite_tenant_manager','platform_revoke_tenant_manager','platform_invite_admin',
               'invite_staff','platform_invite_staff','resend_staff_invitation','platform_resend_staff_invitation',
               'list_pending_invitations','list_grantable_roles','change_my_username','request_manager_assisted_reset','platform_request_staff_reset',
               'create_role','update_role','archive_role','restore_role','list_roles',
               'set_staff_roles','disable_staff','enable_staff','list_staff','get_staff'])),
          null::text[], 'public functions executable by authenticated are exactly the allowlisted RPCs');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'svc\_%' and has_function_privilege('service_role', p.oid, 'EXECUTE') = false),
          null::text[], 'service wrappers are executable by service_role');
