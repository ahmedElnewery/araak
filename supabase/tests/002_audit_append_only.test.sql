select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('audit-a') a;
grant all on fx to public;
select private.write_tenant_audit((select a from fx), 'system', null, null, 'staff', 'staff.disabled', 'staff', 'x',
  '{"ok":1,"password":"p","nested":{"api_key":"k","fine":2},"list":[{"otp":"1","v":3}],"error_code":"c"}');
select private.write_security_event((select a from fx), null, 'login.failed', '{"token":"t","reason":"bad"}');
select private.write_platform_audit(null, 'ops-1', 'tenant.created', '{"secret":"s","n":1}');

select is((select metadata from public.tenant_audit_events where tenant_id = (select a from fx)),
  '{"ok":1,"nested":{"fine":2},"list":[{"v":3}]}'::jsonb, 'tenant audit metadata is sanitized at every depth');
select is((select metadata from public.tenant_security_events where tenant_id = (select a from fx)),
  '{"reason":"bad"}'::jsonb, 'security event metadata is sanitized');
select is((select metadata from public.platform_audit_events where actor_operator_ref = 'ops-1'),
  '{"n":1}'::jsonb, 'platform audit metadata is sanitized');
select throws_ok($q$select private.write_tenant_audit(gen_random_uuid(), 'system', null, null, 'bogus', 'e')$q$,
  '23514', null, 'unknown category is rejected');

-- as the table owner (postgres): triggers still block update/delete/truncate
select throws_ok(format($q$update public.tenant_audit_events set event = 'x' where tenant_id = %L$q$, (select a from fx)),
  'P0001', 'audit_append_only', 'owner cannot UPDATE tenant audit');
select throws_ok(format($q$delete from public.tenant_security_events where tenant_id = %L$q$, (select a from fx)),
  'P0001', 'audit_append_only', 'owner cannot DELETE security events');
select throws_ok($q$truncate public.platform_audit_events$q$, 'P0001', 'audit_append_only', 'owner cannot TRUNCATE platform audit');
select lives_ok(format($q$set local app.retention_purge = 'on'; delete from public.tenant_security_events where tenant_id = %L; set local app.retention_purge = 'off'$q$,
  (select a from fx)), 'retention purge flag allows deletion (operator path only)');
select is((select count(*)::int from public.tenant_security_events where tenant_id = (select a from fx)), 0, 'purged row is gone');

-- client roles
create function tests.denied(p_role text, p_sql text) returns boolean language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    reset role;
    return false;
  exception when insufficient_privilege then
    reset role;
    return true;
  end;
end $$;
select ok(tests.denied('service_role', 'update public.tenant_audit_events set event = event'), 'service_role cannot UPDATE tenant audit');
select ok(tests.denied('service_role', 'delete from public.tenant_audit_events'), 'service_role cannot DELETE tenant audit');
select ok(tests.denied('service_role', 'truncate public.tenant_audit_events'), 'service_role cannot TRUNCATE tenant audit');
select ok(tests.denied('service_role', 'update public.platform_audit_events set event = event'), 'service_role cannot UPDATE platform audit');
select ok(tests.denied('service_role', 'delete from public.tenant_security_events'), 'service_role cannot DELETE security events');
select ok(tests.denied('service_role', 'insert into public.tenant_audit_events (tenant_id, actor_kind, category, event) select id, ''system'', ''staff'', ''x'' from public.tenants limit 1'),
  'service_role cannot INSERT directly (only the writers can)');
select ok(tests.denied('authenticated', 'select 1 from public.tenant_audit_events'), 'authenticated cannot read audit tables directly');
select ok(tests.denied('authenticated', 'insert into public.platform_audit_events (event) values (''x'')'), 'authenticated cannot INSERT');
select ok(tests.denied('anon', 'select 1 from public.platform_audit_events'), 'anon cannot read platform audit');
select ok(tests.denied('authenticated', 'select private.write_tenant_audit(null, ''system'', null, null, ''staff'', ''x'')'),
  'authenticated cannot call the audit writers');
select ok(tests.denied('anon', 'select private.write_platform_audit(null, null, ''x'')'), 'anon cannot call the audit writers');
