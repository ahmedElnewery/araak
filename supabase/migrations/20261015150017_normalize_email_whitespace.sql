-- Parity fixes found by tests/security/parity.test.ts (R-01 otherwise unchanged):
--  1. btrim() removes only spaces; trim an explicit whitespace set identical to the application.
--  2. lower() depends on the database collation; lowercase ASCII letters only on both sides, and accept only
--     printable-ASCII addresses (a non-ASCII case variant could otherwise be a different key here but the same
--     identity in Supabase Auth). Source stays ASCII: code points are written as escapes.

create or replace function private.normalize_email(p_email text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select translate(
    regexp_replace(p_email, '^[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$', '', 'g'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
$$;

alter table public.tenant_staff add constraint tenant_staff_email_ascii_ck
  check (email_normalized ~ '^[!-~]+@[!-~]+$' and char_length(email_normalized) <= 254);
alter table public.staff_invitations add constraint staff_invitations_email_ascii_ck
  check (recipient_email_normalized ~ '^[!-~]+@[!-~]+$' and char_length(recipient_email_normalized) <= 254);
