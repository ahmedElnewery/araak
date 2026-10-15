-- Hardening found by supabase/tests/000_rls_baseline: functions get EXECUTE for PUBLIC by default and a
-- schema-level ALTER DEFAULT PRIVILEGES cannot remove that. Revoke everything in `private`, then re-grant
-- only the allowlist (RLS helpers for `authenticated`, server-side functions for `service_role`).

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.normalize_email(text) to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'current_staff_id()', 'current_tenant_id()', 'request_context_ok()', 'my_role_ids()',
    'has_permission(text, public.record_scope)', 'is_active_tenant_manager()',
    'audit_categories_for_actor()', 'platform_context_ok()', 'is_platform_admin(text)',
    'current_session_is_live()'] loop
    execute format('grant execute on function private.%s to authenticated, service_role', f);
  end loop;
end $$;
