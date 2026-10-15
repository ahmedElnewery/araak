-- Owner decision: platform admins do not reset tenant staff passwords (GATE-RBAC for T121 declined).
-- Only the tenant manager authority can request an assisted reset.
drop function if exists public.platform_request_staff_reset(uuid, text);
