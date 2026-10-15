-- T030 global email reservations (CL-048)

create table public.email_reservations (
  email_normalized text primary key,
  tenant_id uuid not null references public.tenants (id),
  invitation_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index email_reservations_tenant_id_idx on public.email_reservations (tenant_id);
alter table public.email_reservations enable row level security;
alter table public.email_reservations force row level security;
revoke all on public.email_reservations from anon, authenticated;

-- Returns false when the address is unavailable for ANY reason; never says which tenant owns it.
create function private.claim_email_reservation(
  p_tenant_id uuid, p_email_normalized text, p_invitation_id uuid, p_expires_at timestamptz
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare r public.email_reservations;
begin
  if p_email_normalized is distinct from private.normalize_email(p_email_normalized) then
    raise exception 'email_not_normalized' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email:' || p_email_normalized, 0));
  if exists (select 1 from public.tenant_staff s where s.email_normalized = p_email_normalized) then
    return false;
  end if;
  -- GATE-COLLIDE default: a platform admin's mailbox cannot become tenant staff
  if exists (select 1 from public.platform_admins a join auth.users u on u.id = a.auth_user_id
             where private.normalize_email(u.email) = p_email_normalized) then
    return false;
  end if;
  select * into r from public.email_reservations where email_normalized = p_email_normalized;
  if found and r.expires_at > now() and r.invitation_id <> p_invitation_id then
    return false;
  end if;
  insert into public.email_reservations (email_normalized, tenant_id, invitation_id, expires_at)
  values (p_email_normalized, p_tenant_id, p_invitation_id, p_expires_at)
  on conflict (email_normalized) do update
    set tenant_id = excluded.tenant_id, invitation_id = excluded.invitation_id,
        expires_at = excluded.expires_at, created_at = now();
  return true;
end $$;
revoke all on function private.claim_email_reservation(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.claim_email_reservation(uuid, text, uuid, timestamptz) to service_role;
