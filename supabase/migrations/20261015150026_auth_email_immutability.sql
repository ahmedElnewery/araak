-- T117 (CL-012, GATE-AUTH method from T020): an Auth user linked to tenant_staff can never change email or start an email change.

create function private.block_staff_email_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.email is distinct from old.email or coalesce(new.email_change, '') is distinct from coalesce(old.email_change, ''))
     and exists (select 1 from public.tenant_staff s where s.auth_user_id = old.id) then
    raise exception 'staff_email_immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.block_staff_email_change() from public, anon, authenticated;

create trigger block_staff_email_change before update of email, email_change on auth.users
  for each row execute function private.block_staff_email_change();
