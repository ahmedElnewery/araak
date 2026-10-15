-- T026 foundation base: private schema, extensions, enums, email normalization, reserved subdomains.

-- `private` is never exposed through the API (config: api.schemas = public, graphql_public).
-- `authenticated` gets USAGE only so that RLS policy expressions can call the allowlisted
-- helper functions; each function's EXECUTE is granted individually and nothing is granted by default.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create type public.tenant_state as enum ('active', 'suspended');
create type public.record_scope as enum ('all', 'own', 'assigned');
create type public.session_revoked_reason as enum (
  'user', 'user_all_others', 'password_change', 'recovery', 'admin_reset',
  'disabled', 'manager_demoted', 'platform_revoked', 'sign_out'
);

-- R-01 (proven): trim + lowercase of the full address; no dot/plus stripping, no aliases.
create function private.normalize_email(p_email text) returns text
language sql immutable parallel safe set search_path = ''
as $$ select lower(btrim(p_email)) $$;
grant execute on function private.normalize_email(text) to service_role;

create table private.reserved_subdomains (name text primary key);
insert into private.reserved_subdomains (name) values
  ('admin'), ('www'), ('api'), ('app'), ('mail'), ('smtp'),
  ('auth'), ('static'), ('assets'), ('portal'), ('status'), ('support');
alter table private.reserved_subdomains enable row level security;
alter table private.reserved_subdomains force row level security;
