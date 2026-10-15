-- T051 effective permissions for the CURRENT actor (derived from auth.uid() and the JWT session_id, never a parameter).
-- Used by the server to hide UI and as an early check; RLS/RPC checks remain authoritative.

create function public.my_effective_permissions() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.request_context_ok() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'isManager', private.is_active_tenant_manager(),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object('key', pg.permission_key, 'scope', pg.scope, 'auditCategories', pg.audit_categories))
      from public.permission_grants pg
      where pg.role_id in (select private.my_role_ids())), '[]'::jsonb));
end $$;
revoke all on function public.my_effective_permissions() from public, anon;
grant execute on function public.my_effective_permissions() to authenticated, service_role;
