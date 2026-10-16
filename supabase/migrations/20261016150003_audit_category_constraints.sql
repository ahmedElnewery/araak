-- T172 approved tenant audit categories and Security Log event types (docs/decisions/audit-events.md, GATE-RBAC).
-- The check constraints are the last line of defence: no writer can emit an unapproved category or security event
-- type, so nothing reaches storage without an approved retention policy (plan "NON-ADMIN RETENTION").
-- packages/authorization/src/audit-categories.ts mirrors both lists (tests/security/parity.test.ts compares them).

create function private.approved_audit_categories() returns text[]
language sql immutable set search_path = ''
as $$ select array['staff', 'invitations', 'roles', 'tenant_settings', 'sessions']::text[] $$;

create function private.approved_security_event_types() returns text[]
language sql immutable set search_path = ''
as $$
  select array['auth.sign_in_failed', 'authz.denied', 'authz.privilege_escalation_denied',
               'authz.self_membership_denied', 'authz.role_self_edit_denied', 'session.invalid_reuse']::text[]
$$;

revoke all on function private.approved_audit_categories() from public, anon, authenticated;
revoke all on function private.approved_security_event_types() from public, anon, authenticated;
grant execute on function private.approved_audit_categories() to service_role;
grant execute on function private.approved_security_event_types() to service_role;

alter table public.tenant_audit_events drop constraint tenant_audit_events_category_check;
alter table public.tenant_audit_events
  add constraint tenant_audit_events_category_ck check (category = any (private.approved_audit_categories()));
alter table public.tenant_security_events
  add constraint tenant_security_events_event_ck check (event = any (private.approved_security_event_types()));

-- A hold names an approved category of the tenant audit only, a platform hold has no tenant, and its window is real.
alter table public.audit_legal_holds
  add constraint audit_legal_holds_category_ck check (
    category is null or (target = 'tenant_audit' and category = any (private.approved_audit_categories()))),
  add constraint audit_legal_holds_tenant_ck check (target <> 'platform_audit' or tenant_id is null),
  add constraint audit_legal_holds_window_ck check (from_ts < until_ts);

-- Viewer filters (actor) and the daily expiry scan (occurred_at across tenants).
create index tenant_audit_events_actor_idx on public.tenant_audit_events (tenant_id, actor_staff_id, occurred_at desc)
  where actor_staff_id is not null;
create index tenant_audit_events_occurred_idx on public.tenant_audit_events (occurred_at);
create index tenant_security_events_occurred_idx on public.tenant_security_events (occurred_at);
