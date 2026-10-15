-- Shared prelude (prepended by scripts/run-db-tests.mjs). Runs inside the test's transaction.

create schema tests;
grant usage on schema tests to public;

create function tests.mk_tenant(p_sub text, p_state public.tenant_state default 'active') returns uuid
language sql as $$
  insert into public.tenants (display_name, subdomain, state) values ('Org ' || p_sub, p_sub, p_state) returning id $$;

create function tests.mk_user(p_email text) returns uuid
language plpgsql as $$
declare i uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values (i, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '', now(), now(), now(), '{}', '{}');
  return i;
end $$;

-- creates the Auth user and the tenant_staff row; returns the staff id
create function tests.mk_staff(p_tenant uuid, p_username text, p_email text, p_enabled boolean default true,
                               out staff_id uuid, out user_id uuid)
language plpgsql as $$
begin
  user_id := tests.mk_user(p_email);
  insert into public.tenant_staff (tenant_id, auth_user_id, email, email_normalized, username, enabled, activated_at)
  values (p_tenant, user_id, p_email, lower(btrim(p_email)), p_username, p_enabled, now()) returning id into staff_id;
end $$;

create function tests.mk_session(p_user uuid, p_tenant uuid, p_staff uuid, p_activity timestamptz default now(),
                                 p_revoked boolean default false) returns uuid
language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into public.session_registry (provider_session_id, auth_user_id, tenant_id, staff_id, verified_activity_at,
                                       revoked_at, revoked_reason)
  values (sid, p_user, p_tenant, p_staff, p_activity, case when p_revoked then now() end,
          case when p_revoked then 'user'::public.session_revoked_reason end);
  return sid;
end $$;

-- registers a live platform-admin session (platform_admins row must exist)
create function tests.mk_psession(p_user uuid, p_activity timestamptz default now()) returns uuid
language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into public.session_registry (provider_session_id, auth_user_id, platform_admin_id, verified_activity_at)
  values (sid, p_user, p_user, p_activity);
  return sid;
end $$;

create function tests.mk_role(p_tenant uuid, p_name text) returns uuid
language sql as $$ insert into public.roles (tenant_id, name) values (p_tenant, p_name) returning id $$;

create function tests.act_as(p_user uuid, p_session uuid default null) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'session_id', p_session)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $$;

-- claims only (no role switch): for SECURITY DEFINER functions that read auth.uid()/auth.jwt() while the test runs as owner
create function tests.claims(p_user uuid, p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'session_id', p_session)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

create function tests.seen_priv(p_role text, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('set local role %I', p_role);
  begin
    execute format('select count(*) from (%s) q', p_sql) into n;
  exception when insufficient_privilege then n := -1;
  end;
  reset role;
  return n;
end $$;

create function tests.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function tests.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on all functions in schema tests to public;

-- Minimal pgTAP-compatible assertion subset (is, ok, throws_ok, lives_ok, no_plan). The pgTAP extension
-- cannot be patched on the managed project, and its output is dropped by the multi-statement API,
-- so results are recorded in tests.results and read by scripts/run-db-tests.mjs.
create table tests.results (numb int generated always as identity, ok boolean not null, descr text);
grant all on tests.results to public;
create function tests.record(p_ok boolean, p_descr text) returns text language plpgsql as $$
begin
  insert into tests.results (ok, descr) values (coalesce(p_ok, false), p_descr);
  return (case when coalesce(p_ok, false) then 'ok - ' else 'not ok - ' end) || coalesce(p_descr, '');
end $$;
create function tests.ok(p_ok boolean, p_descr text) returns text language sql as $$ select tests.record(p_ok, p_descr) $$;
create function tests."is"(a anyelement, b anyelement, p_descr text) returns text language sql as
  $$ select tests.record(a is not distinct from b, p_descr || case when a is not distinct from b then ''
       else format(' [got %s, expected %s]', coalesce(a::text, 'NULL'), coalesce(b::text, 'NULL')) end) $$;
create function tests.throws_ok(p_sql text, p_code text, p_msg text, p_descr text) returns text language plpgsql as $$
declare st text; m text;
begin
  begin
    execute p_sql;
    return tests.record(false, p_descr || ' [no exception thrown]');
  exception when others then
    get stacked diagnostics st = returned_sqlstate, m = message_text;
  end;
  return tests.record((p_code is null or st = p_code) and (p_msg is null or m = p_msg),
    p_descr || case when (p_code is null or st = p_code) and (p_msg is null or m = p_msg) then ''
                    else format(' [got %s: %s]', st, m) end);
end $$;
create function tests.lives_ok(p_sql text, p_descr text) returns text language plpgsql as $$
declare m text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics m = message_text;
    return tests.record(false, p_descr || ' [raised: ' || m || ']');
  end;
  return tests.record(true, p_descr);
end $$;
create function tests.no_plan() returns text language sql as $$ select 'no_plan'::text $$;
create function tests.open_tap() returns text language sql as $$ select 'open'::text $$;
grant execute on all functions in schema tests to public;
set local search_path = tests, public;
