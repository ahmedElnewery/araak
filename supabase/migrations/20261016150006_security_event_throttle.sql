-- T178 Security Log flood control (FR-033, CL-034). Events raised by the application (failed sign-ins, guard
-- denials, reuse of a revoked or expired session) can repeat as fast as a client retries. An event identical to one
-- written for the same tenant and actor in the last 60 seconds (same type, same sanitized metadata) is dropped.
-- Denials recorded inside RPCs keep using private.write_security_event directly and are never deduplicated.

create function private.write_security_event_throttled(
  p_tenant_id uuid, p_actor_staff_id uuid, p_event text, p_metadata jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare v_meta jsonb := private.sanitize_audit_metadata(p_metadata);
begin
  -- concurrent identical writers queue here, so only the first one inserts
  perform pg_advisory_xact_lock(hashtextextended(
    'security-event:' || p_tenant_id::text || ':' || coalesce(p_actor_staff_id::text, '') || ':' || p_event || ':' || v_meta::text, 0));
  if exists (
    select 1 from public.tenant_security_events e
     where e.tenant_id = p_tenant_id and e.event = p_event
       and e.actor_staff_id is not distinct from p_actor_staff_id
       and e.metadata = v_meta
       and e.occurred_at > now() - interval '60 seconds') then
    return null;
  end if;
  return private.write_security_event(p_tenant_id, p_actor_staff_id, p_event, v_meta);
end $$;

revoke all on function private.write_security_event_throttled(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function private.write_security_event_throttled(uuid, uuid, text, jsonb) to service_role;

-- The application's only path to the Security Log (packages/auth/src/server/audit.ts) now goes through the throttle.
create or replace function public.svc_write_security_event(
  p_tenant_id uuid, p_actor_staff_id uuid, p_event text, p_metadata jsonb default '{}') returns bigint
language sql security invoker set search_path = ''
as $$ select private.write_security_event_throttled(p_tenant_id, p_actor_staff_id, p_event, p_metadata) $$;
