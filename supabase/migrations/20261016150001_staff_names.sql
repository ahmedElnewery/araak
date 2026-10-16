-- Staff first and last names. The portal shows them in place of the username; the username stays the Latin-only
-- sign-in identifier (CL-005: display names may be Arabic). Every activation from now on records both names.
-- Accounts activated before this migration keep null names (the portal then shows the username) until the staff
-- member adds them under My account; once set they can be changed but not cleared.

-- Same backstop as private.valid_tenant_display_name: the app applies the stricter letters-only rule
-- (packages/auth/src/person-name.ts) and sends the trimmed, single-spaced value.
create function private.valid_person_name(p_name text) returns boolean
language sql immutable set search_path = ''
as $$ select p_name is not null and p_name = btrim(p_name) and char_length(p_name) between 1 and 50
              and p_name !~ '[[:cntrl:]<>]' $$;
revoke all on function private.valid_person_name(text) from public, anon, authenticated;

alter table public.tenant_staff
  add column first_name text,
  add column last_name text,
  add constraint tenant_staff_names_both_ck check ((first_name is null) = (last_name is null)),
  add constraint tenant_staff_first_name_ck check (first_name is null or (first_name = btrim(first_name)
    and char_length(first_name) between 1 and 50 and first_name !~ '[[:cntrl:]<>]')),
  add constraint tenant_staff_last_name_ck check (last_name is null or (last_name = btrim(last_name)
    and char_length(last_name) between 1 and 50 and last_name !~ '[[:cntrl:]<>]'));

-- Redemption now takes the names. Raises: invitation_invalid, username_invalid, username_taken, first_name_invalid,
-- last_name_invalid. Any raise rolls everything back, so a failed activation consumes nothing.
drop function public.svc_redeem_staff_invitation(text, uuid, text);
drop function private.redeem_staff_invitation(text, uuid, text);

create function private.redeem_staff_invitation(
  p_token_hash text, p_auth_user_id uuid, p_username text, p_first_name text, p_last_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv_id uuid;
  inv public.staff_invitations;
  link public.staff_invitation_links;
  v_staff uuid;
  v_skipped uuid[] := '{}';
  v_role record;
  v_constraint text;
begin
  select l.invitation_id into v_inv_id from public.staff_invitation_links l where l.token_hash = p_token_hash;
  if v_inv_id is null then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  -- lock order: invitation first (the same order resend uses), then the link
  select * into inv from public.staff_invitations i where i.id = v_inv_id for update;
  select * into link from public.staff_invitation_links l where l.token_hash = p_token_hash for update;
  if inv.state <> 'pending' or link.consumed_at is not null or link.superseded_at is not null
     or now() >= link.expires_at
     or not exists (select 1 from public.tenants t where t.id = inv.tenant_id and t.state = 'active') then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if p_username is null or char_length(p_username) not between 3 and 30
     or p_username !~ '^[A-Za-z]+(?:[._][A-Za-z]+)*$' then
    raise exception 'username_invalid' using errcode = 'P0001';
  end if;
  if not private.valid_person_name(p_first_name) then raise exception 'first_name_invalid' using errcode = 'P0001'; end if;
  if not private.valid_person_name(p_last_name) then raise exception 'last_name_invalid' using errcode = 'P0001'; end if;
  begin
    insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, first_name, last_name,
                                     activated_at)
    values (inv.tenant_id, p_auth_user_id, inv.recipient_email, inv.recipient_email_normalized, p_username,
            p_first_name, p_last_name, now())
    returning id into v_staff;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'tenant_staff_username_tenant_key' then raise exception 'username_taken' using errcode = 'P0001'; end if;
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end;
  for v_role in
    select ir.role_id, (r.archived_at is null) as active
    from public.staff_invitation_roles ir join public.roles r on r.id = ir.role_id and r.tenant_id = ir.tenant_id
    where ir.invitation_id = inv.id
  loop
    if v_role.active then
      insert into public.staff_roles (tenant_id, staff_id, role_id) values (inv.tenant_id, v_staff, v_role.role_id);
    else
      v_skipped := v_skipped || v_role.role_id;
    end if;
  end loop;
  if inv.grants_manager then
    insert into public.tenant_manager_grants (tenant_id, staff_id, granted_by_platform_admin)
    values (inv.tenant_id, v_staff, inv.invited_by_platform_admin_id);
  end if;
  update public.staff_invitation_links set consumed_at = now() where id = link.id;
  update public.staff_invitations set state = 'redeemed', redeemed_staff_id = v_staff where id = inv.id;
  delete from public.email_reservations where email_normalized = inv.recipient_email_normalized and invitation_id = inv.id;
  perform private.write_tenant_audit(inv.tenant_id, 'staff', v_staff, null, 'staff', 'staff.activated', 'tenant_staff', v_staff::text,
    jsonb_build_object('invitationId', inv.id, 'grantsManager', inv.grants_manager,
                       'skippedArchivedRoles', to_jsonb(v_skipped)));
  return v_staff;
end $$;

create function public.svc_redeem_staff_invitation(
  p_token_hash text, p_auth_user_id uuid, p_username text, p_first_name text, p_last_name text
) returns uuid
language sql security invoker set search_path = ''
as $$ select private.redeem_staff_invitation(p_token_hash, p_auth_user_id, p_username, p_first_name, p_last_name) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.redeem_staff_invitation(text, uuid, text, text, text)',
    'public.svc_redeem_staff_invitation(text, uuid, text, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- The guard pipeline's context carries the names (null for an account that has not added them yet).
create or replace function public.svc_load_staff_context(p_auth_user_id uuid, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'staffId', s.id, 'tenantId', s.tenant_id, 'username', s.username, 'email', s.email,
    'firstName', s.first_name, 'lastName', s.last_name,
    'enabled', s.enabled, 'tenantState', t.state,
    'sessionLive', exists (
      select 1 from public.session_registry sr
      where sr.provider_session_id = p_session_id and sr.auth_user_id = p_auth_user_id
        and sr.staff_id = s.id and sr.revoked_at is null
        and sr.verified_activity_at > now() - interval '30 days'),
    'isManager', exists (
      select 1 from public.tenant_manager_grants g
      where g.staff_id = s.id and g.tenant_id = s.tenant_id and g.revoked_at is null))
  from public.tenant_staff s join public.tenants t on t.id = s.tenant_id
  where s.auth_user_id = p_auth_user_id
$$;

-- Staff directory and detail: the names, ordered by the name the portal shows (the username when there is none).
create or replace function private.staff_json(p_tenant uuid, p_staff_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with covered as materialized (select private.actor_covered_role_ids() as id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'username', s.username, 'firstName', s.first_name, 'lastName', s.last_name,
    'email', s.email, 'enabled', s.enabled, 'activatedAt', s.activated_at,
    'isManager', exists (select 1 from public.tenant_manager_grants g
                         where g.tenant_id = s.tenant_id and g.staff_id = s.id and g.revoked_at is null),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
                         'canGrant', exists (select 1 from covered c where c.id = r.id)) order by r.name_normalized)
                       from public.staff_roles sr join public.roles r on r.id = sr.role_id
                       where sr.staff_id = s.id), '[]'::jsonb)
  ) order by lower(coalesce(s.first_name || ' ' || s.last_name, s.username)), s.username_normalized), '[]'::jsonb)
  from public.tenant_staff s
  where s.tenant_id = p_tenant and (p_staff_id is null or s.id = p_staff_id)
$$;

-- Own names only, live session, no password step (like change_my_username, CL-011). Both names are required.
create function public.change_my_name(p_first_name text, p_last_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.tenant_staff := private.current_staff();
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not private.valid_person_name(p_first_name) then raise exception 'first_name_invalid' using errcode = 'P0001'; end if;
  if not private.valid_person_name(p_last_name) then raise exception 'last_name_invalid' using errcode = 'P0001'; end if;
  if p_first_name = v_staff.first_name and p_last_name = v_staff.last_name then return; end if;
  update public.tenant_staff set first_name = p_first_name, last_name = p_last_name where id = v_staff.id;
  perform private.write_tenant_audit(v_staff.tenant_id, 'staff', v_staff.id, null, 'staff', 'staff.name_changed',
    'tenant_staff', v_staff.id::text, jsonb_build_object(
      'oldFirstName', v_staff.first_name, 'oldLastName', v_staff.last_name,
      'newFirstName', p_first_name, 'newLastName', p_last_name));
end $$;
revoke all on function public.change_my_name(text, text) from public, anon;
grant execute on function public.change_my_name(text, text) to authenticated, service_role;
