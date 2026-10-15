-- T057 staff invitations (no cancel function: FR-009, CL-003, CL-020)

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  recipient_email text not null,
  recipient_email_normalized text not null check (recipient_email_normalized = private.normalize_email(recipient_email)),
  grants_manager boolean not null default false,
  invited_by_staff_id uuid null,
  invited_by_platform_admin_id uuid null references public.platform_admins (auth_user_id),
  state text not null default 'pending' check (state in ('pending', 'redeemed')),
  redeemed_staff_id uuid null,
  created_at timestamptz not null default now(),
  constraint staff_invitations_tenant_id_id_key unique (tenant_id, id),
  constraint staff_invitations_inviter_fk foreign key (tenant_id, invited_by_staff_id) references public.tenant_staff (tenant_id, id),
  constraint staff_invitations_redeemed_fk foreign key (tenant_id, redeemed_staff_id) references public.tenant_staff (tenant_id, id),
  constraint staff_invitations_one_actor_ck check ((invited_by_staff_id is null) <> (invited_by_platform_admin_id is null)),
  -- the protected manager authority can only be conferred by a platform admin (spec 4a)
  constraint staff_invitations_manager_ck check (not grants_manager or invited_by_platform_admin_id is not null),
  constraint staff_invitations_redeemed_ck check ((state = 'redeemed') = (redeemed_staff_id is not null))
);
-- one open invitation per email per tenant; expired ones are resent, not re-issued
create unique index staff_invitations_pending_email_uniq
  on public.staff_invitations (tenant_id, recipient_email_normalized) where state = 'pending';
create index staff_invitations_tenant_idx on public.staff_invitations (tenant_id);

create table public.staff_invitation_roles (
  tenant_id uuid not null,
  invitation_id uuid not null,
  role_id uuid not null,
  primary key (invitation_id, role_id),
  constraint staff_invitation_roles_inv_fk foreign key (tenant_id, invitation_id) references public.staff_invitations (tenant_id, id),
  constraint staff_invitation_roles_role_fk foreign key (tenant_id, role_id) references public.roles (tenant_id, id)
);
create index staff_invitation_roles_tenant_idx on public.staff_invitation_roles (tenant_id);

create table public.staff_invitation_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invitation_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('initial', 'resend')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  superseded_at timestamptz null,
  constraint staff_invitation_links_inv_fk foreign key (tenant_id, invitation_id) references public.staff_invitations (tenant_id, id),
  constraint staff_invitation_links_ttl_ck check (expires_at = issued_at + interval '168 hours')
);
create index staff_invitation_links_inv_idx on public.staff_invitation_links (tenant_id, invitation_id);

do $$
declare t text;
begin
  foreach t in array array['staff_invitations', 'staff_invitation_roles', 'staff_invitation_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('revoke delete, truncate on public.%I from service_role', t);
  end loop;
end $$;

create function private.issue_staff_invitation(
  p_tenant_id uuid, p_email text, p_role_ids uuid[], p_grants_manager boolean,
  p_actor_staff_id uuid, p_actor_platform_admin_id uuid, p_token_hash text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_norm text := private.normalize_email(p_email);
  v_now timestamptz := now();
  v_role uuid;
begin
  -- No authorization here: callers (authorized RPCs) decide who may invite and which roles.
  perform private.rbac_lock(p_tenant_id);
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.state = 'active') then
    raise exception 'tenant_unavailable' using errcode = 'P0001';
  end if;
  insert into public.staff_invitations (id, tenant_id, recipient_email, recipient_email_normalized, grants_manager,
                                        invited_by_staff_id, invited_by_platform_admin_id)
  values (v_id, p_tenant_id, btrim(p_email), v_norm, p_grants_manager, p_actor_staff_id, p_actor_platform_admin_id);
  if not private.claim_email_reservation(p_tenant_id, v_norm, v_id, v_now + interval '168 hours') then
    raise exception 'email_unavailable' using errcode = 'P0001';   -- neutral: never says why or who
  end if;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    if not exists (select 1 from public.roles r where r.id = v_role and r.tenant_id = p_tenant_id and r.archived_at is null) then
      raise exception 'role_unavailable' using errcode = 'P0001';
    end if;
    insert into public.staff_invitation_roles (tenant_id, invitation_id, role_id) values (p_tenant_id, v_id, v_role);
  end loop;
  insert into public.staff_invitation_links (tenant_id, invitation_id, token_hash, kind, issued_at, expires_at)
  values (p_tenant_id, v_id, p_token_hash, 'initial', v_now, v_now + interval '168 hours');
  return v_id;
exception when unique_violation then
  -- an open invitation for this email already exists in this tenant (or the same token hash): neutral failure
  raise exception 'email_unavailable' using errcode = 'P0001';
end $$;
revoke all on function private.issue_staff_invitation(uuid, text, uuid[], boolean, uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.issue_staff_invitation(uuid, text, uuid[], boolean, uuid, uuid, text) to service_role;
