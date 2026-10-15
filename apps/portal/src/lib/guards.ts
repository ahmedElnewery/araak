import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, createSupabaseServerClient, getTenantStaffContext, recordMeaningfulActivity, recordSecurityEvent } from "@workspace/auth/server";
import { can, loadEffectivePermissions, type EffectivePermissions, type PermissionKey, type RecordScope } from "@workspace/authorization";
import { requireTenant } from "./tenant-context";

async function deny(ctx: { tenantId: string; staffId: string }, reason: string): Promise<never> {
  // Best effort: a logging failure must never turn a denial into access.
  await recordSecurityEvent({ tenantId: ctx.tenantId, staffId: ctx.staffId, event: "authz.denied", metadata: { reason } }).catch(() => undefined);
  redirect("/forbidden");
}

/** Signed-in, enabled staff of THIS host's tenant with a live session; otherwise redirects without disclosure. */
type StaffCtx = Awaited<ReturnType<typeof getTenantStaffContext>>;

/**
 * One guard pipeline per request (getClaims + svc_load_staff_context): the layout and the page share it, like
 * resolveTenantFromHost. A failure is memoized too, so both report the same outcome.
 */
const loadStaffContext = cache(async (): Promise<StaffCtx | AuthError> => {
  const tenant = await requireTenant();
  const supabase = await createSupabaseServerClient("portal");
  try {
    return await getTenantStaffContext(tenant, supabase);
  } catch (e) {
    if (e instanceof AuthError) return e;
    throw e;
  }
});

/** The actor's effective permissions, loaded once per request for the memoized context. */
export const loadPermissions = cache((ctx: StaffCtx): Promise<EffectivePermissions> => loadEffectivePermissions(ctx));

/**
 * Pass `{ touch: false }` from shared layouts and from guards that still have to authorize the request: the caller
 * then renews the session itself once the request is fully authorized, so a denied request never counts.
 */
export async function requireStaff(opts: { touch?: boolean } = {}) {
  const ctx = await loadStaffContext();
  if (ctx instanceof AuthError) {
    if (ctx.code === "suspended") redirect("/suspended");
    if (ctx.code === "forbidden") redirect("/forbidden");
    if (ctx.code === "session_expired") redirect("/login?reason=expired");
    redirect("/login");
  }
  if (opts.touch !== false) await renewSession(ctx);
  return ctx;
}

/**
 * Renews the 30-day window once per request, and only after authorization succeeded (CL-036). Prefetches and
 * passive requests are skipped inside `recordMeaningfulActivity`; a failure never changes the response.
 */
const touchState = cache(() => ({ started: false }));
export async function renewSession(ctx: StaffCtx): Promise<void> {
  const state = touchState();
  if (state.started) return;
  state.started = true;
  await recordMeaningfulActivity(ctx, { headers: await headers() }).catch(() => undefined);
}

export async function requirePermission(key: PermissionKey, scope?: RecordScope) {
  const ctx = await requireStaff({ touch: false });
  const perms = await loadPermissions(ctx);
  if (!can(perms, key, scope)) return deny(ctx, `permission:${key}`);
  await renewSession(ctx);
  return { ...ctx, permissions: perms };
}

/** Protected tenant-manager authority (branding, Security Log, resend, manager-assisted reset). */
export async function requireManager() {
  const ctx = await requireStaff({ touch: false });
  if (!ctx.isManager) return deny(ctx, "manager_only");
  await renewSession(ctx);
  return ctx;
}
