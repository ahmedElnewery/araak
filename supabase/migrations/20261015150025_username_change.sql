-- T115 username change (FR-010, FR-011, CL-011): live session only, no password step, no email change anywhere.

create function public.change_my_username(p_username text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.tenant_staff := private.current_staff();
  v_constraint text;
begin
  if not private.request_context_ok() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_username is null or char_length(p_username) not between 3 and 30
     or p_username !~ '^[A-Za-z]+(?:[._][A-Za-z]+)*$' then
    raise exception 'username_invalid' using errcode = 'P0001';
  end if;
  if p_username = v_staff.username then return; end if;
  begin
    update public.tenant_staff set username = p_username where id = v_staff.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    raise exception 'username_taken' using errcode = 'P0001';
  end;
  perform private.write_tenant_audit(v_staff.tenant_id, 'staff', v_staff.id, null, 'staff', 'staff.username_changed',
    'tenant_staff', v_staff.id::text, jsonb_build_object('oldUsername', v_staff.username, 'newUsername', p_username));
end $$;
revoke all on function public.change_my_username(text) from public, anon;
grant execute on function public.change_my_username(text) to authenticated, service_role;
