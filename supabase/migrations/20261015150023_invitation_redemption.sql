-- T107 invitation peek and redemption. Anonymous-flow functions: service_role only (never client-callable).

create function private.peek_staff_invitation(p_token_hash text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('valid', true, 'tenantId', i.tenant_id, 'email', i.recipient_email)
    from public.staff_invitation_links l
    join public.staff_invitations i on i.id = l.invitation_id and i.tenant_id = l.tenant_id
    join public.tenants t on t.id = i.tenant_id
    where l.token_hash = p_token_hash and l.consumed_at is null and l.superseded_at is null
      and now() < l.expires_at and i.state = 'pending' and t.state = 'active'),
    jsonb_build_object('valid', false, 'tenantId', null, 'email', null))
$$;

-- Raises neutral codes: invitation_invalid (anything wrong with the link), username_invalid, username_taken.
-- Any raise rolls everything back, so a failed activation consumes nothing.
create function private.redeem_staff_invitation(p_token_hash text, p_auth_user_id uuid, p_username text) returns uuid
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
  begin
    insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, activated_at)
    values (inv.tenant_id, p_auth_user_id, inv.recipient_email, inv.recipient_email_normalized, p_username, now())
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

create function public.svc_peek_staff_invitation(p_token_hash text) returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.peek_staff_invitation(p_token_hash) $$;
create function public.svc_redeem_staff_invitation(p_token_hash text, p_auth_user_id uuid, p_username text) returns uuid
language sql security invoker set search_path = ''
as $$ select private.redeem_staff_invitation(p_token_hash, p_auth_user_id, p_username) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.peek_staff_invitation(text)', 'private.redeem_staff_invitation(text, uuid, text)',
    'public.svc_peek_staff_invitation(text)', 'public.svc_redeem_staff_invitation(text, uuid, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
