-- T173 audit read RPCs (FR-031, FR-033, CL-032, CL-035).
-- Tenant audit: explicit audit_logs.view, rows AND totals computed after intersecting with the viewer's categories
-- (an active manager holds every administrative category). Security Log: the active tenant manager only, never via
-- any grant. Platform audit: platform_audit.view only. Reads are never audited (FR-032); exports are.
-- Every reader derives tenant and actor from auth.uid() and the JWT session; ids of other tenants, categories or
-- logs all answer the same `event_not_found`.

-- Page size and export cap. An export larger than the cap is truncated and says so.
create function private.audit_page_limit(p_limit integer) returns integer
language sql immutable set search_path = ''
as $$ select least(greatest(coalesce(p_limit, 50), 1), 100) $$;

create function private.audit_export_cap() returns integer
language sql immutable set search_path = ''
as $$ select 5000 $$;

-- LIKE pattern for a free-text search: wildcards in the input are literal, blank means no search.
create function private.audit_search_pattern(p_search text) returns text
language sql immutable set search_path = ''
as $$
  select case when nullif(btrim(coalesce(p_search, '')), '') is null then null
              else '%' || replace(replace(replace(left(btrim(p_search), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' end
$$;

-- The categories the caller may read, intersected with the requested ones (null = all of them). Raises when the
-- caller has no audit_logs.view at all; an empty result reads nothing.
create function private.tenant_audit_scope(p_categories text[]) returns text[]
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_permission('audit_logs.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return array(select c from unnest(private.audit_categories_for_actor()) c
               where p_categories is null or c = any (p_categories) order by c);
end $$;

create function private.filter_tenant_audit(
  p_tenant_id uuid, p_categories text[], p_from timestamptz, p_to timestamptz, p_actor uuid, p_search text
) returns setof public.tenant_audit_events
language sql stable security definer set search_path = ''
as $$
  select e.*
  from public.tenant_audit_events e
  where e.tenant_id = p_tenant_id
    and e.category = any (p_categories)
    and (p_from is null or e.occurred_at >= p_from)
    and (p_to is null or e.occurred_at <= p_to)
    and (p_actor is null or e.actor_staff_id = p_actor)
    and (private.audit_search_pattern(p_search) is null or (
         e.event ilike private.audit_search_pattern(p_search)
      or e.resource_id ilike private.audit_search_pattern(p_search)
      or private.sanitize_audit_metadata(e.metadata)::text ilike private.audit_search_pattern(p_search)
      or exists (select 1 from public.tenant_staff s
                 where s.id = e.actor_staff_id and s.tenant_id = e.tenant_id
                   and (s.username ilike private.audit_search_pattern(p_search)
                        or coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '') ilike private.audit_search_pattern(p_search)))))
$$;

-- Safe projection: staff actors by name only (no email), platform actors never identified to the tenant.
create function private.tenant_audit_json(e public.tenant_audit_events) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'occurredAt', e.occurred_at, 'category', e.category, 'event', e.event, 'actorKind', e.actor_kind,
    'actor', (select jsonb_build_object('staffId', s.id, 'username', s.username, 'firstName', s.first_name, 'lastName', s.last_name)
              from public.tenant_staff s where s.id = e.actor_staff_id and s.tenant_id = e.tenant_id),
    'resourceType', e.resource_type, 'resourceId', e.resource_id,
    'metadata', private.sanitize_audit_metadata(e.metadata))
$$;

create function public.list_tenant_audit(
  p_categories text[] default null, p_from timestamptz default null, p_to timestamptz default null,
  p_actor uuid default null, p_search text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cats text[] := private.tenant_audit_scope(p_categories);
  v_tenant uuid := private.current_tenant_id();
  v_rows jsonb;
  v_total bigint;
begin
  with page as (
    select f.id from private.filter_tenant_audit(v_tenant, v_cats, p_from, p_to, p_actor, p_search) f
    order by f.occurred_at desc, f.id desc
    limit private.audit_page_limit(p_limit) offset greatest(coalesce(p_offset, 0), 0))
  select coalesce(jsonb_agg(private.tenant_audit_json(e) order by e.occurred_at desc, e.id desc), '[]'::jsonb) into v_rows
  from public.tenant_audit_events e join page on page.id = e.id;
  select count(*) into v_total from private.filter_tenant_audit(v_tenant, v_cats, p_from, p_to, p_actor, p_search);
  return jsonb_build_object('rows', v_rows, 'totalCount', v_total,
    'categories', to_jsonb(array(select c from unnest(private.audit_categories_for_actor()) c order by c)));
end $$;

create function public.get_tenant_audit_event(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cats text[] := private.tenant_audit_scope(null);
  v jsonb;
begin
  select private.tenant_audit_json(e) into v
  from public.tenant_audit_events e
  where e.id = p_id and e.tenant_id = private.current_tenant_id() and e.category = any (v_cats);
  if v is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  return v;
end $$;

-- Same authorization and filters as the list, up to the cap. The export itself is an audited administrative act.
create function public.export_tenant_audit(
  p_categories text[] default null, p_from timestamptz default null, p_to timestamptz default null,
  p_actor uuid default null, p_search text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cats text[] := private.tenant_audit_scope(p_categories);
  v_tenant uuid := private.current_tenant_id();
  v_rows jsonb;
  v_n integer;
  v_truncated boolean;
begin
  with page as (
    select f.id from private.filter_tenant_audit(v_tenant, v_cats, p_from, p_to, p_actor, p_search) f
    order by f.occurred_at desc, f.id desc limit private.audit_export_cap() + 1)
  select coalesce(jsonb_agg(private.tenant_audit_json(e) order by e.occurred_at desc, e.id desc), '[]'::jsonb) into v_rows
  from public.tenant_audit_events e join page on page.id = e.id;
  v_n := jsonb_array_length(v_rows);
  v_truncated := v_n > private.audit_export_cap();
  if v_truncated then
    v_rows := v_rows - private.audit_export_cap();
    v_n := private.audit_export_cap();
  end if;
  perform private.write_tenant_audit(v_tenant, 'staff', private.current_staff_id(), null, 'tenant_settings', 'audit.exported',
    null, null, jsonb_build_object('log', 'audit', 'categories', to_jsonb(v_cats), 'rows', v_n, 'truncated', v_truncated,
      'from', p_from, 'to', p_to, 'actorFiltered', p_actor is not null,
      'searchFiltered', private.audit_search_pattern(p_search) is not null));
  return jsonb_build_object('rows', v_rows, 'truncated', v_truncated);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Security Log (CL-035): is_active_tenant_manager() only. No permission key, role or grant can open it.

create function private.require_security_log_viewer() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_active_tenant_manager() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return private.current_tenant_id();
end $$;

create function private.filter_security_events(
  p_tenant_id uuid, p_from timestamptz, p_to timestamptz, p_event text, p_search text
) returns setof public.tenant_security_events
language sql stable security definer set search_path = ''
as $$
  select e.*
  from public.tenant_security_events e
  where e.tenant_id = p_tenant_id
    and (p_from is null or e.occurred_at >= p_from)
    and (p_to is null or e.occurred_at <= p_to)
    and (nullif(p_event, '') is null or e.event = p_event)
    and (private.audit_search_pattern(p_search) is null or (
         e.event ilike private.audit_search_pattern(p_search)
      or private.sanitize_audit_metadata(e.metadata)::text ilike private.audit_search_pattern(p_search)
      or exists (select 1 from public.tenant_staff s
                 where s.id = e.actor_staff_id and s.tenant_id = e.tenant_id
                   and (s.username ilike private.audit_search_pattern(p_search)
                        or coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '') ilike private.audit_search_pattern(p_search)))))
$$;

create function private.security_event_json(e public.tenant_security_events) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'occurredAt', e.occurred_at, 'event', e.event,
    'actor', (select jsonb_build_object('staffId', s.id, 'username', s.username, 'firstName', s.first_name, 'lastName', s.last_name)
              from public.tenant_staff s where s.id = e.actor_staff_id and s.tenant_id = e.tenant_id),
    'metadata', private.sanitize_audit_metadata(e.metadata))
$$;

create function public.list_security_events(
  p_from timestamptz default null, p_to timestamptz default null, p_event text default null, p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := private.require_security_log_viewer();
  v_rows jsonb;
  v_total bigint;
begin
  with page as (
    select f.id from private.filter_security_events(v_tenant, p_from, p_to, p_event, p_search) f
    order by f.occurred_at desc, f.id desc
    limit private.audit_page_limit(p_limit) offset greatest(coalesce(p_offset, 0), 0))
  select coalesce(jsonb_agg(private.security_event_json(e) order by e.occurred_at desc, e.id desc), '[]'::jsonb) into v_rows
  from public.tenant_security_events e join page on page.id = e.id;
  select count(*) into v_total from private.filter_security_events(v_tenant, p_from, p_to, p_event, p_search);
  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end $$;

create function public.get_security_event(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := private.require_security_log_viewer();
  v jsonb;
begin
  select private.security_event_json(e) into v from public.tenant_security_events e where e.id = p_id and e.tenant_id = v_tenant;
  if v is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  return v;
end $$;

create function public.export_security_events(
  p_from timestamptz default null, p_to timestamptz default null, p_event text default null, p_search text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := private.require_security_log_viewer();
  v_rows jsonb;
  v_n integer;
  v_truncated boolean;
begin
  with page as (
    select f.id from private.filter_security_events(v_tenant, p_from, p_to, p_event, p_search) f
    order by f.occurred_at desc, f.id desc limit private.audit_export_cap() + 1)
  select coalesce(jsonb_agg(private.security_event_json(e) order by e.occurred_at desc, e.id desc), '[]'::jsonb) into v_rows
  from public.tenant_security_events e join page on page.id = e.id;
  v_n := jsonb_array_length(v_rows);
  v_truncated := v_n > private.audit_export_cap();
  if v_truncated then
    v_rows := v_rows - private.audit_export_cap();
    v_n := private.audit_export_cap();
  end if;
  perform private.write_tenant_audit(v_tenant, 'staff', private.current_staff_id(), null, 'tenant_settings', 'audit.exported',
    null, null, jsonb_build_object('log', 'security', 'rows', v_n, 'truncated', v_truncated, 'from', p_from, 'to', p_to,
      'eventFiltered', nullif(p_event, '') is not null, 'searchFiltered', private.audit_search_pattern(p_search) is not null));
  return jsonb_build_object('rows', v_rows, 'truncated', v_truncated);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Platform audit (FR-031, US6 scenario 4): platform events only, for platform_audit.view. Never tenant audit or
-- Security Log rows; the only tenant detail is the organization name a platform admin already sees in the tenant list.

create function private.platform_audit_json(e public.platform_audit_events) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'occurredAt', e.occurred_at, 'event', e.event,
    'actorKind', case when e.actor_platform_admin_id is not null then 'platform_admin'
                      when e.actor_operator_ref is not null then 'operator' else 'system' end,
    'actor', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = e.actor_platform_admin_id),
    'operatorRef', e.actor_operator_ref,
    'tenant', (select jsonb_build_object('id', t.id, 'displayName', t.display_name) from public.tenants t
               where (e.metadata ->> 'tenantId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and t.id = (e.metadata ->> 'tenantId')::uuid),
    'metadata', private.sanitize_audit_metadata(e.metadata))
$$;

create function private.filter_platform_audit(p_from timestamptz, p_to timestamptz, p_event text, p_search text)
returns setof public.platform_audit_events
language sql stable security definer set search_path = ''
as $$
  select e.*
  from public.platform_audit_events e
  where (p_from is null or e.occurred_at >= p_from)
    and (p_to is null or e.occurred_at <= p_to)
    and (nullif(p_event, '') is null or e.event = p_event)
    and (private.audit_search_pattern(p_search) is null or (
         e.event ilike private.audit_search_pattern(p_search)
      or e.actor_operator_ref ilike private.audit_search_pattern(p_search)
      or private.sanitize_audit_metadata(e.metadata)::text ilike private.audit_search_pattern(p_search)
      or exists (select 1 from auth.users u where u.id = e.actor_platform_admin_id and u.email ilike private.audit_search_pattern(p_search))))
$$;

create function public.platform_list_audit(
  p_from timestamptz default null, p_to timestamptz default null, p_event text default null, p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total bigint;
begin
  if not private.is_platform_admin('platform_audit.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  with page as (
    select f.id from private.filter_platform_audit(p_from, p_to, p_event, p_search) f
    order by f.occurred_at desc, f.id desc
    limit private.audit_page_limit(p_limit) offset greatest(coalesce(p_offset, 0), 0))
  select coalesce(jsonb_agg(private.platform_audit_json(e) order by e.occurred_at desc, e.id desc), '[]'::jsonb) into v_rows
  from public.platform_audit_events e join page on page.id = e.id;
  select count(*) into v_total from private.filter_platform_audit(p_from, p_to, p_event, p_search);
  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end $$;

-- ---------------------------------------------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'audit_page_limit(integer)', 'audit_export_cap()', 'audit_search_pattern(text)', 'tenant_audit_scope(text[])',
    'filter_tenant_audit(uuid, text[], timestamptz, timestamptz, uuid, text)', 'tenant_audit_json(public.tenant_audit_events)',
    'require_security_log_viewer()', 'filter_security_events(uuid, timestamptz, timestamptz, text, text)',
    'security_event_json(public.tenant_security_events)', 'platform_audit_json(public.platform_audit_events)',
    'filter_platform_audit(timestamptz, timestamptz, text, text)'] loop
    execute format('revoke all on function private.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'list_tenant_audit(text[], timestamptz, timestamptz, uuid, text, integer, integer)', 'get_tenant_audit_event(bigint)',
    'export_tenant_audit(text[], timestamptz, timestamptz, uuid, text)',
    'list_security_events(timestamptz, timestamptz, text, text, integer, integer)', 'get_security_event(bigint)',
    'export_security_events(timestamptz, timestamptz, text, text)',
    'platform_list_audit(timestamptz, timestamptz, text, text, integer, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
