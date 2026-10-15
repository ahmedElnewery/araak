-- T143 record-scope helper for FUTURE business modules (FR-028). No business tables exist yet.
-- A record is reachable when the actor is in the record's tenant and holds the key with scope `all`, or `own` for a
-- record they own, or `assigned` for a record they are assigned to. `own`/`assigned` never imply `all`.

create function private.has_permission_for_record(
  p_key text, p_tenant_id uuid, p_owner_staff_id uuid, p_assignee_ids uuid[]
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.request_context_ok()
    and p_tenant_id is not distinct from (select private.current_tenant_id())
    and (
      private.has_permission(p_key, 'all')
      or (p_owner_staff_id is not null and p_owner_staff_id = (select private.current_staff_id())
          and private.has_permission(p_key, 'own'))
      or ((select private.current_staff_id()) = any (coalesce(p_assignee_ids, '{}'))
          and private.has_permission(p_key, 'assigned'))
    )
$$;
revoke all on function private.has_permission_for_record(text, uuid, uuid, uuid[]) from public, anon;
grant execute on function private.has_permission_for_record(text, uuid, uuid, uuid[]) to authenticated, service_role;
