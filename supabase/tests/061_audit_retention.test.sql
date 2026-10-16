-- T168 audit retention (FR-033, CL-033, CL-034): 12 months administrative, 3 months security, legal holds honoured.
set local search_path = tests, public;
select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('ret-a') a, tests.mk_tenant('ret-b') b;

-- seeded directly with past timestamps (as the owner; the writers always stamp now())
create temp table ev (k text primary key, id bigint);
create function tests.adm(p_k text, p_tenant uuid, p_category text, p_age interval) returns void language sql as $$
  with i as (insert into public.tenant_audit_events (tenant_id, actor_kind, category, event, occurred_at)
             values (p_tenant, 'system', p_category, 'staff.disabled', now() - p_age) returning id)
  insert into ev select p_k, id from i $$;
create function tests.sec(p_k text, p_tenant uuid, p_age interval) returns void language sql as $$
  with i as (insert into public.tenant_security_events (tenant_id, event, occurred_at)
             values (p_tenant, 'authz.denied', now() - p_age) returning id)
  insert into ev select p_k, id from i $$;
create function tests.alive(p_k text) returns boolean language sql as $$
  select exists (select 1 from public.tenant_audit_events e join ev on ev.id = e.id and ev.k = p_k where p_k like 'adm%')
      or exists (select 1 from public.tenant_security_events e join ev on ev.id = e.id and ev.k = p_k where p_k like 'sec%') $$;

select tests.adm('adm_a_old', (select a from fx), 'staff', interval '12 months 1 day');
select tests.adm('adm_a_edge', (select a from fx), 'staff', interval '11 months 29 days');
select tests.adm('adm_a_new', (select a from fx), 'roles', interval '1 day');
select tests.adm('adm_b_old_held', (select b from fx), 'roles', interval '13 months');
select tests.adm('adm_b_old_other_cat', (select b from fx), 'staff', interval '13 months');
select tests.adm('adm_b_new', (select b from fx), 'staff', interval '2 months');
select tests.sec('sec_a_old', (select a from fx), interval '3 months 1 day');
select tests.sec('sec_a_new', (select a from fx), interval '2 months 29 days');
select tests.sec('sec_b_old_held', (select b from fx), interval '4 months');
select tests.sec('sec_b_new', (select b from fx), interval '1 day');
create temp table plat as select private.write_platform_audit(null, 'ret-test', 'tenant.created', '{}') id;

-- holds: tenant B's roles events from 14 to 12 months ago; every security event of tenant B from 5 to 3 months ago
insert into public.audit_legal_holds (target, tenant_id, category, from_ts, until_ts, approved_by) values
  ('tenant_audit', (select b from fx), 'roles', now() - interval '14 months', now() - interval '12 months', 'legal-ticket-1'),
  ('tenant_security', (select b from fx), null, now() - interval '5 months', now() - interval '3 months', 'legal-ticket-2');

create temp table res as select private.purge_expired_audit() r;

select is(tests.alive('adm_a_old'), false, 'an administrative event older than 12 months is purged');
select is(tests.alive('adm_a_edge'), true, 'an administrative event younger than 12 months stays');
select is(tests.alive('adm_a_new'), true, 'a recent administrative event stays');
select is(tests.alive('adm_b_old_held'), true, 'an expired event covered by a legal hold stays');
select is(tests.alive('adm_b_old_other_cat'), false, 'a hold covers only its category');
select is(tests.alive('adm_b_new'), true, 'another tenant''s unexpired event is untouched');
select is(tests.alive('sec_a_old'), false, 'a security event older than 3 months is purged');
select is(tests.alive('sec_a_new'), true, 'a security event younger than 3 months stays');
select is(tests.alive('sec_b_old_held'), true, 'a held security event stays');
select is(tests.alive('sec_b_new'), true, 'another tenant''s recent security event is untouched');
select ok(exists (select 1 from public.platform_audit_events where id = (select id from plat)), 'platform audit is not purged');
select ok(exists (select 1 from public.audit_legal_holds where approved_by = 'legal-ticket-1'), 'holds themselves are kept');

-- summary: one platform event with counts only
create temp table summary as
  select e.metadata, e.actor_operator_ref from public.platform_audit_events e where e.event = 'retention.purged' order by e.id desc limit 1;
select is((select count(*)::int from public.platform_audit_events where event = 'retention.purged'
           and occurred_at = now()), 1, 'one retention.purged platform event per run');
select ok((select (metadata ->> 'tenantAudit')::int >= 2 and (metadata ->> 'securityEvents')::int >= 1 from summary), 'the summary carries the counts');
select is((select array(select jsonb_object_keys(metadata) order by 1) from summary), array['securityEvents', 'tenantAudit'], 'and nothing else');
select ok((select metadata::text !~ (select a::text from fx) and metadata::text !~ (select b::text from fx) from summary), 'no tenant identifiers in the summary');
select is((select r from res), (select metadata from summary), 'the function returns the same counts');

-- the purge flag does not outlive the purge; direct DELETE stays impossible
select is(coalesce(current_setting('app.retention_purge', true), ''), 'off', 'the purge flag is switched off afterwards');
select tests.throws_ok(format($$delete from public.tenant_audit_events where id = %s$$, (select id from ev where k = 'adm_a_new')),
  'P0001', 'audit_append_only', 'a direct DELETE is still refused after a purge');
select tests.throws_ok(format($$delete from public.tenant_security_events where id = %s$$, (select id from ev where k = 'sec_a_new')),
  'P0001', 'audit_append_only', 'a direct DELETE of a security event is still refused');

-- only the scheduler runs it
select ok(not has_function_privilege('authenticated', 'private.purge_expired_audit()', 'execute'), 'authenticated cannot run the purge');
select ok(not has_function_privilege('anon', 'private.purge_expired_audit()', 'execute'), 'anon cannot run the purge');
select ok(not has_function_privilege('service_role', 'private.purge_expired_audit()', 'execute'), 'service_role cannot run the purge');
select is((select schedule from cron.job where jobname = 'purge-expired-audit'), '17 3 * * *', 'the purge is scheduled daily');
select is((select command from cron.job where jobname = 'purge-expired-audit'), 'select private.purge_expired_audit()', 'with the purge function');
