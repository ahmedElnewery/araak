-- T174 automated audit retention (FR-033, CL-033, CL-034): tenant administrative events are kept 12 months, Security
-- Log events 3 months, both from the event time. Platform audit has no approved retention yet and is never purged.
-- A legal hold (public.audit_legal_holds, written by operators only) preserves the events of its target whose time
-- falls inside [from_ts, until_ts], narrowed to its tenant and category when those are set, for as long as the hold row
-- exists. Nobody purges by hand: the append-only triggers refuse every DELETE unless this function set the flag.

create function private.purge_expired_audit() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant_audit integer;
  v_security integer;
  v_summary jsonb;
begin
  perform set_config('app.retention_purge', 'on', true);

  delete from public.tenant_audit_events e
   where e.occurred_at < now() - interval '12 months'
     and not exists (
       select 1 from public.audit_legal_holds h
        where h.target = 'tenant_audit'
          and (h.tenant_id is null or h.tenant_id = e.tenant_id)
          and (h.category is null or h.category = e.category)
          and e.occurred_at >= h.from_ts and e.occurred_at <= h.until_ts);
  get diagnostics v_tenant_audit = row_count;

  delete from public.tenant_security_events e
   where e.occurred_at < now() - interval '3 months'
     and not exists (
       select 1 from public.audit_legal_holds h
        where h.target = 'tenant_security'
          and (h.tenant_id is null or h.tenant_id = e.tenant_id)
          and e.occurred_at >= h.from_ts and e.occurred_at <= h.until_ts);
  get diagnostics v_security = row_count;

  perform set_config('app.retention_purge', 'off', true);

  -- counts only: no tenant, actor or event detail leaves the purged rows
  v_summary := jsonb_build_object('tenantAudit', v_tenant_audit, 'securityEvents', v_security);
  perform private.write_platform_audit(null, null, 'retention.purged', v_summary);
  return v_summary;
end $$;

revoke all on function private.purge_expired_audit() from public, anon, authenticated, service_role;

create extension if not exists pg_cron;
select cron.schedule('purge-expired-audit', '17 3 * * *', 'select private.purge_expired_audit()');
