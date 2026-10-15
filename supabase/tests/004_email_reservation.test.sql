select tests.no_plan();
select tests.open_tap();

create temp table fx as select tests.mk_tenant('res-a') a, tests.mk_tenant('res-b') b;
create temp table padm as select tests.mk_user('root@res.test') uid;
insert into public.platform_admins (auth_user_id, capabilities, created_via) select uid, '{tenants.manage}', 'bootstrap' from padm;
create temp table sa as select * from tests.mk_staff((select a from fx), 'alice', 'alice@res.test');
create temp table sdis as select * from tests.mk_staff((select a from fx), 'dina', 'dina@res.test', false);
create temp table ra as select tests.mk_role((select a from fx), 'Role A') id;
create temp table rb as select tests.mk_role((select b from fx), 'Role B') id;
create temp table rarch as select tests.mk_role((select a from fx), 'Old A') id;
update public.roles set archived_at = now() where id = (select id from rarch);

create function tests.issue(p_tenant uuid, p_email text, p_roles uuid[] default '{}', p_manager boolean default false,
                            p_by_platform boolean default true) returns uuid language sql as $$
  select private.issue_staff_invitation(p_tenant, p_email, p_roles, p_manager,
    case when p_by_platform then null else (select staff_id from sa) end,
    case when p_by_platform then (select uid from padm) end,
    encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex')) $$;

-- first claim works
select lives_ok(format($q$select tests.issue(%L, 'Ahmed@Example.ORG')$q$, (select a from fx)), 'issuing for a fresh email works');
select is((select count(*)::int from public.email_reservations where email_normalized = 'ahmed@example.org'), 1, 'reservation is stored normalized');
select is((select expires_at - issued_at from public.staff_invitation_links l join public.staff_invitations i on i.id = l.invitation_id
           where i.recipient_email_normalized = 'ahmed@example.org'), interval '168 hours', 'link TTL is exactly 168 hours');

-- same email, other tenant: neutral failure, no tenant info, normalization cannot be bypassed
select throws_ok(format($q$select tests.issue(%L, 'ahmed@example.org')$q$, (select b from fx)), 'P0001', 'email_unavailable', 'other tenant is denied with a neutral error');
select throws_ok(format($q$select tests.issue(%L, '  AHMED@example.org ')$q$, (select b from fx)), 'P0001', 'email_unavailable', 'case/space variants cannot bypass');
select is((select count(*)::int from public.staff_invitations where recipient_email_normalized = 'ahmed@example.org'), 1, 'failed attempts leave no invitation behind');

-- same tenant duplicate
select throws_ok(format($q$select tests.issue(%L, 'AHMED@example.org')$q$, (select a from fx)), 'P0001', 'email_unavailable', 'second invitation for the same email in the same tenant is denied');

-- expired reservation can be reclaimed by another tenant; the original tenant can no longer take it silently
update public.email_reservations set expires_at = now() - interval '1 second' where email_normalized = 'ahmed@example.org';
select lives_ok(format($q$select tests.issue(%L, 'ahmed@example.org')$q$, (select b from fx)), 'expired unredeemed reservation is released and reclaimable');
select is((select tenant_id from public.email_reservations where email_normalized = 'ahmed@example.org'), (select b from fx), 'reservation now belongs to the new tenant');
select throws_ok(format($q$select tests.issue(%L, 'ahmed@example.org')$q$, (select a from fx)), 'P0001', 'email_unavailable', 'and the previous tenant is now blocked');

-- existing staff (activated or disabled) always blocks
select throws_ok(format($q$select tests.issue(%L, 'alice@res.test')$q$, (select b from fx)), 'P0001', 'email_unavailable', 'activated staff email blocks other tenants');
select throws_ok(format($q$select tests.issue(%L, 'Alice@Res.test')$q$, (select a from fx)), 'P0001', 'email_unavailable', 'activated staff email blocks the same tenant');
select throws_ok(format($q$select tests.issue(%L, 'dina@res.test')$q$, (select b from fx)), 'P0001', 'email_unavailable', 'disabled staff email blocks other tenants');
select throws_ok(format($q$select tests.issue(%L, 'dina@res.test')$q$, (select a from fx)), 'P0001', 'email_unavailable', 'disabled staff email blocks the same tenant');

-- platform admin mailbox
select throws_ok(format($q$select tests.issue(%L, 'root@res.test')$q$, (select a from fx)), 'P0001', 'email_unavailable', 'a platform admin mailbox cannot be invited as staff');

-- the claim function itself
select is(private.claim_email_reservation((select a from fx), 'fresh@res.test', gen_random_uuid(), now() + interval '1 hour'), true, 'claim succeeds for a fresh email');
select throws_ok(format($q$select private.claim_email_reservation(%L, ' Mixed@Case.test', gen_random_uuid(), now() + interval '1 hour')$q$, (select a from fx)),
  'P0001', 'email_not_normalized', 'claim refuses a non-normalized input');

-- roles and manager flag
select lives_ok(format($q$select tests.issue(%L, 'withrole@res.test', array[%L]::uuid[])$q$, (select a from fx), (select id from ra)), 'valid role is attached');
select throws_ok(format($q$select tests.issue(%L, 'archrole@res.test', array[%L]::uuid[])$q$, (select a from fx), (select id from rarch)), 'P0001', 'role_unavailable', 'archived role is refused');
select throws_ok(format($q$select tests.issue(%L, 'xrole@res.test', array[%L]::uuid[])$q$, (select a from fx), (select id from rb)), 'P0001', 'role_unavailable', 'a role of another tenant is refused');
select is((select count(*)::int from public.email_reservations where email_normalized in ('archrole@res.test', 'xrole@res.test')), 0, 'a refused role rolls the reservation back');
select throws_ok(format($q$select tests.issue(%L, 'mgr@res.test', '{}', true, false)$q$, (select a from fx)), '23514', null, 'only a platform admin can invite a manager');
select lives_ok(format($q$select tests.issue(%L, 'mgr@res.test', '{}', true, true)$q$, (select a from fx)), 'a platform admin can invite a manager');
select throws_ok(format($q$select private.issue_staff_invitation(%L, 'nokey@res.test', '{}', false, null, null, 'nothex')$q$, (select a from fx)), '23514', null, 'a link needs a SHA-256 hex hash');

-- suspended tenant
update public.tenants set state = 'suspended' where id = (select b from fx);
select throws_ok(format($q$select tests.issue(%L, 'susp@res.test')$q$, (select b from fx)), 'P0001', 'tenant_unavailable', 'suspended tenants cannot invite');

-- reservations and invitations are not client-visible
select is(tests.seen_priv('authenticated', 'select 1 from public.staff_invitations'), -1::bigint, 'authenticated cannot read invitations');
select is(tests.seen_priv('authenticated', 'select 1 from public.staff_invitation_links'), -1::bigint, 'authenticated cannot read invitation links');
select is(tests.seen_priv('authenticated', 'select 1 from public.email_reservations'), -1::bigint, 'authenticated cannot read reservations');
