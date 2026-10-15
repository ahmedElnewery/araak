-- The staff role editor (US4) lists exactly the roles the actor may assign. Assigning needs `staff.roles.assign`, which
-- does not imply `roles.view`, so list_grantable_roles also serves it. The database ceiling stays authoritative.
create or replace function public.list_grantable_roles() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.request_context_ok()
     or not (private.has_permission('staff.invite') or private.has_permission('staff.roles.assign') or private.is_active_tenant_manager()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name_normalized)
    from public.roles r
    where r.tenant_id = (select private.current_tenant_id()) and r.archived_at is null
      and private.actor_can_grant_role(r.id)), '[]'::jsonb);
end $$;
