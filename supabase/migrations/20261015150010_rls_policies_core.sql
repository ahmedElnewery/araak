-- T035 core RLS: default deny; SELECT policies only. All mutations go through SECURITY DEFINER RPCs.
-- Every policy first requires request_context_ok() (staff enabled, tenant active, live session).

grant select on public.tenants, public.tenant_staff, public.roles, public.permission_grants,
  public.staff_roles, public.session_registry, public.platform_admins to authenticated;

create policy tenants_select_own on public.tenants for select to authenticated
  using (id = (select private.current_tenant_id()) and (select private.request_context_ok()));

create policy tenant_staff_select on public.tenant_staff for select to authenticated
  using ((select private.request_context_ok())
    and (auth_user_id = (select auth.uid())
         or (tenant_id = (select private.current_tenant_id()) and (select private.has_permission('staff.view')))));

create policy roles_select on public.roles for select to authenticated
  using ((select private.request_context_ok())
    and tenant_id = (select private.current_tenant_id())
    and ((select private.has_permission('roles.view')) or id in (select private.my_role_ids())));

create policy permission_grants_select on public.permission_grants for select to authenticated
  using ((select private.request_context_ok())
    and tenant_id = (select private.current_tenant_id())
    and ((select private.has_permission('roles.view')) or role_id in (select private.my_role_ids())));

create policy staff_roles_select on public.staff_roles for select to authenticated
  using ((select private.request_context_ok())
    and tenant_id = (select private.current_tenant_id())
    and (staff_id = (select private.current_staff_id())
         or (select private.has_permission('staff.view'))
         or (select private.has_permission('roles.view'))));

create policy session_registry_select_own on public.session_registry for select to authenticated
  using (auth_user_id = (select auth.uid())
    and ((select private.request_context_ok()) or (select private.platform_context_ok())));

create policy platform_admins_select_self on public.platform_admins for select to authenticated
  using (auth_user_id = (select auth.uid()) and (select private.platform_context_ok()));
