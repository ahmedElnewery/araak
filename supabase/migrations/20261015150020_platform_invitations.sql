-- T081 platform-admin invitations: 24 h, single use (FR-001, CL-040, CL-042). The Platform Admin row exists only
-- after redemption. There is no cancel, removal or demotion function.

create table public.platform_invitations (
  id uuid primary key default gen_random_uuid(),
  recipient_email_normalized text not null check (recipient_email_normalized = private.normalize_email(recipient_email_normalized)),
  capabilities text[] not null check (
    cardinality(capabilities) > 0 and
    capabilities <@ array['tenants.manage','tenants.managers.manage','tenants.staff.manage',
                          'platform_admins.invite','platform_audit.view']::text[]),
  invited_by uuid not null references public.platform_admins (auth_user_id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  constraint platform_invitations_ttl_ck check (expires_at = issued_at + interval '24 hours')
);
create index platform_invitations_email_idx on public.platform_invitations (recipient_email_normalized);
alter table public.platform_invitations enable row level security;
alter table public.platform_invitations force row level security;
revoke all on public.platform_invitations from anon, authenticated;
revoke delete, truncate on public.platform_invitations from service_role;

create function public.platform_invite_admin(p_email text, p_capabilities text[], p_token_hash text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_norm text := private.normalize_email(coalesce(p_email, ''));
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_caps text[];
begin
  if not private.is_platform_admin('platform_admins.invite') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_norm !~ '^[^@\s]+@[^@\s]+$' then raise exception 'email_invalid' using errcode = 'P0001'; end if;
  if p_capabilities is null or cardinality(p_capabilities) = 0
     or not (p_capabilities <@ array['tenants.manage','tenants.managers.manage','tenants.staff.manage',
                                     'platform_admins.invite','platform_audit.view']::text[]) then
    raise exception 'capabilities_invalid' using errcode = 'P0001';
  end if;
  select a.capabilities into v_caps from public.platform_admins a where a.auth_user_id = v_actor;
  if not (p_capabilities <@ v_caps) then raise exception 'capabilities_exceed_inviter' using errcode = 'P0001'; end if;
  -- an email already used by tenant staff, or reserved by an open staff invitation, can never become an admin
  if exists (select 1 from public.tenant_staff s where s.email_normalized = v_norm)
     or exists (select 1 from public.email_reservations r where r.email_normalized = v_norm and r.expires_at > v_now) then
    raise exception 'email_unavailable' using errcode = 'P0001';
  end if;
  insert into public.platform_invitations (id, recipient_email_normalized, capabilities, invited_by, token_hash, issued_at, expires_at)
  values (v_id, v_norm, (select array_agg(distinct c order by c) from unnest(p_capabilities) c), v_actor, p_token_hash, v_now, v_now + interval '24 hours');
  perform private.write_platform_audit(v_actor, null, 'platform_admin.invited',
    jsonb_build_object('invitationId', v_id, 'capabilities', to_jsonb(p_capabilities)));
  return v_id;
exception when unique_violation then
  raise exception 'email_unavailable' using errcode = 'P0001';
end $$;
revoke all on function public.platform_invite_admin(text, text[], text) from public, anon;
grant execute on function public.platform_invite_admin(text, text[], text) to authenticated, service_role;

-- Anonymous-flow functions: service_role only, never reachable by a client.
create function private.peek_platform_invitation(p_token_hash text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('valid', i.consumed_at is null and now() < i.expires_at,
                              'email', case when i.consumed_at is null and now() < i.expires_at then i.recipient_email_normalized end)
    from public.platform_invitations i where i.token_hash = p_token_hash),
    jsonb_build_object('valid', false, 'email', null))
$$;

-- Returns false for every rejection (audited without the token), true on success.
create function private.redeem_platform_invitation(p_token_hash text, p_auth_user_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.platform_invitations;
  v_email text;
begin
  select * into inv from public.platform_invitations i where i.token_hash = p_token_hash for update;
  if not found or inv.consumed_at is not null or now() >= inv.expires_at then
    perform private.write_platform_audit(null, null, 'platform_admin.invitation_rejected', jsonb_build_object('reason', 'invalid_or_expired'));
    return false;
  end if;
  select private.normalize_email(u.email) into v_email from auth.users u where u.id = p_auth_user_id;
  if v_email is null or v_email <> inv.recipient_email_normalized then
    perform private.write_platform_audit(null, null, 'platform_admin.invitation_rejected', jsonb_build_object('reason', 'recipient_mismatch', 'invitationId', inv.id));
    return false;
  end if;
  begin
    insert into public.platform_admins (auth_user_id, capabilities, created_via)
    values (p_auth_user_id, inv.capabilities, 'invitation');
  exception when others then
    perform private.write_platform_audit(null, null, 'platform_admin.invitation_rejected', jsonb_build_object('reason', 'identity_unavailable', 'invitationId', inv.id));
    return false;
  end;
  update public.platform_invitations set consumed_at = now() where id = inv.id;
  perform private.write_platform_audit(p_auth_user_id, null, 'platform_admin.invitation_accepted',
    jsonb_build_object('invitationId', inv.id, 'capabilities', to_jsonb(inv.capabilities)));
  return true;
end $$;

create function public.svc_peek_platform_invitation(p_token_hash text) returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.peek_platform_invitation(p_token_hash) $$;
create function public.svc_redeem_platform_invitation(p_token_hash text, p_auth_user_id uuid) returns boolean
language sql security invoker set search_path = ''
as $$ select private.redeem_platform_invitation(p_token_hash, p_auth_user_id) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.peek_platform_invitation(text)', 'private.redeem_platform_invitation(text, uuid)',
    'public.svc_peek_platform_invitation(text)', 'public.svc_redeem_platform_invitation(text, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
