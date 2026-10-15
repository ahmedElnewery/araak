-- T106 staff invitation RPCs (FR-008, FR-009, CL-004, CL-021, CL-022). There is deliberately no cancel function.

create function private.assert_email_shape(p_email text) returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if coalesce(btrim(p_email), '') !~ '^[^@\s]+@[^@\s]+$' or char_length(btrim(p_email)) > 320 then
    raise exception 'email_invalid' using errcode = 'P0001';
  end if;
  return btrim(p_email);
end $$;
revoke all on function private.assert_email_shape(text) from public, anon, authenticated;
grant execute on function private.assert_email_shape(text) to service_role;

-- Shared by the tenant and platform resend RPCs. Callers authorize; this function enforces cooldown and cap.
-- Every denial raises, so nothing it did is kept: the existing link, expiry and cooldown stay unchanged.
create function private.resend_invitation(p_tenant_id uuid, p_invitation_id uuid, p_token_hash text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.staff_invitations;
  v_now timestamptz := now();
  v_last timestamptz;
  v_resends int;
begin
  select * into inv from public.staff_invitations i
   where i.id = p_invitation_id and i.tenant_id = p_tenant_id for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if inv.state <> 'pending' then raise exception 'invitation_not_pending' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.state = 'active') then
    raise exception 'tenant_unavailable' using errcode = 'P0001';
  end if;
  select max(l.issued_at) into v_last from public.staff_invitation_links l where l.invitation_id = inv.id;
  if v_now - v_last < interval '900 seconds' then raise exception 'resend_cooldown' using errcode = 'P0001'; end if;
  select count(*) into v_resends from public.staff_invitation_links l
   where l.invitation_id = inv.id and l.kind = 'resend' and l.issued_at > v_now - interval '24 hours';
  if v_resends >= 5 then raise exception 'resend_cap_reached' using errcode = 'P0001'; end if;
  -- the reservation may have lapsed with the old link; another tenant could have claimed the address since
  if not private.claim_email_reservation(p_tenant_id, inv.recipient_email_normalized, inv.id, v_now + interval '168 hours') then
    raise exception 'email_unavailable' using errcode = 'P0001';
  end if;
  update public.staff_invitation_links set superseded_at = v_now
   where invitation_id = inv.id and superseded_at is null and consumed_at is null;
  insert into public.staff_invitation_links (tenant_id, invitation_id, token_hash, kind, issued_at, expires_at)
  values (p_tenant_id, inv.id, p_token_hash, 'resend', v_now, v_now + interval '168 hours');
  return inv.recipient_email;
exception when unique_violation then
  raise exception 'email_unavailable' using errcode = 'P0001';
end $$;
revoke all on function private.resend_invitation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.resend_invitation(uuid, uuid, text) to service_role;

create function public.invite_staff(p_email text, p_role_ids uuid[], p_token_hash text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_staff uuid := (select private.current_staff_id());
  v_email text;
  v_roles uuid[];
  v_role uuid;
  v_id uuid;
begin
  if not private.request_context_ok() or not (private.has_permission('staff.invite') or private.is_active_tenant_manager()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_email := private.assert_email_shape(p_email);
  select coalesce(array_agg(distinct r), '{}') into v_roles from unnest(coalesce(p_role_ids, '{}')) r;
  perform private.rbac_lock(v_tenant);
  foreach v_role in array v_roles loop
    if not private.actor_can_grant_role(v_role) then
      raise exception 'role_not_grantable' using errcode = 'P0001';   -- inactive, foreign, or above the actor's ceiling
    end if;
  end loop;
  v_id := private.issue_staff_invitation(v_tenant, v_email, v_roles, false, v_staff, null, p_token_hash);
  perform private.write_tenant_audit(v_tenant, 'staff', v_staff, null, 'invitations', 'invitation.issued',
    'staff_invitation', v_id::text, jsonb_build_object('roleCount', cardinality(v_roles)));
  return v_id;
end $$;

create function public.platform_invite_staff(p_tenant_id uuid, p_email text, p_role_ids uuid[], p_token_hash text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_roles uuid[];
  v_id uuid;
begin
  if not private.is_platform_admin('tenants.staff.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.tenants t where t.id = p_tenant_id;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0001'; end if;
  v_email := private.assert_email_shape(p_email);
  select coalesce(array_agg(distinct r), '{}') into v_roles from unnest(coalesce(p_role_ids, '{}')) r;
  -- the manager authority is conferred only through platform_invite_tenant_manager, never here
  v_id := private.issue_staff_invitation(p_tenant_id, v_email, v_roles, false, null, v_actor, p_token_hash);
  perform private.write_tenant_audit(p_tenant_id, 'platform_admin', null, v_actor, 'invitations', 'invitation.issued',
    'staff_invitation', v_id::text, jsonb_build_object('roleCount', cardinality(v_roles)));
  return v_id;
end $$;

-- Returns the recipient address so the server can mail the fresh link.
create function public.resend_staff_invitation(p_invitation_id uuid, p_token_hash text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_staff uuid := (select private.current_staff_id());
  v_email text;
begin
  if not private.is_active_tenant_manager() then raise exception 'not_authorized' using errcode = '42501'; end if;
  v_email := private.resend_invitation(v_tenant, p_invitation_id, p_token_hash);
  perform private.write_tenant_audit(v_tenant, 'staff', v_staff, null, 'invitations', 'invitation.resent',
    'staff_invitation', p_invitation_id::text, '{}');
  return v_email;
end $$;

create function public.platform_resend_staff_invitation(p_invitation_id uuid, p_token_hash text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_tenant uuid;
  v_email text;
begin
  if not private.is_platform_admin('tenants.staff.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select i.tenant_id into v_tenant from public.staff_invitations i where i.id = p_invitation_id;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  v_email := private.resend_invitation(v_tenant, p_invitation_id, p_token_hash);
  perform private.write_tenant_audit(v_tenant, 'platform_admin', null, v_actor, 'invitations', 'invitation.resent',
    'staff_invitation', p_invitation_id::text, '{}');
  return v_email;
end $$;

-- Tenant-scoped, never returns token hashes. canResend/nextResendAt mirror the enforced cooldown and cap.
create function public.list_pending_invitations() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_tenant uuid := (select private.current_tenant_id());
begin
  if not private.request_context_ok()
     or not (private.has_permission('staff.invite') or private.has_permission('staff.view')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(row order by row->>'createdAt') from (
      select jsonb_build_object(
        'invitationId', i.id, 'email', i.recipient_email, 'createdAt', i.created_at,
        'roles', coalesce((select jsonb_agg(r.name order by r.name) from public.staff_invitation_roles ir
                           join public.roles r on r.id = ir.role_id where ir.invitation_id = i.id), '[]'::jsonb),
        'issuedAt', x.last_issued, 'expiresAt', x.last_expires, 'expired', x.last_expires <= now(),
        'resendsInWindow', x.resends,
        'nextResendAt', greatest(x.last_issued + interval '900 seconds',
                                 case when x.resends >= 5 then x.oldest_resend + interval '24 hours' end),
        'canResend', now() >= greatest(x.last_issued + interval '900 seconds',
                                       coalesce(case when x.resends >= 5 then x.oldest_resend + interval '24 hours' end, '-infinity'))
      ) as row
      from public.staff_invitations i
      cross join lateral (
        select max(l.issued_at) last_issued, max(l.expires_at) last_expires,
               count(*) filter (where l.kind = 'resend' and l.issued_at > now() - interval '24 hours') resends,
               min(l.issued_at) filter (where l.kind = 'resend' and l.issued_at > now() - interval '24 hours') oldest_resend
        from public.staff_invitation_links l where l.invitation_id = i.id) x
      where i.tenant_id = v_tenant and i.state = 'pending'
    ) q), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'invite_staff(text, uuid[], text)', 'platform_invite_staff(uuid, text, uuid[], text)',
    'resend_staff_invitation(uuid, text)', 'platform_resend_staff_invitation(uuid, text)',
    'list_pending_invitations()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
