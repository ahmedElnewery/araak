import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, createSupabaseServerClient, getTenantStaffContext, recordMeaningfulActivity, recordSecurityEvent } from "@workspace/auth/server";
import { can, loadEffectivePermissions, type PermissionKey, type RecordScope } from "@workspace/authorization";
import { requireTenant } from "./tenant-context";

async function deny(ctx: { tenantId: string; staffId: string }, reason: string): Promise<never> {
  // Best effort: a logging failure must never turn a denial into access.
  await recordSecurityEvent({ tenantId: ctx.tenantId, staffId: ctx.staffId, event: "authz.denied", metadata: { reason } }).catch(() => undefined);
  redirect("/forbidden");
}

/** Signed-in, enabled staff of THIS host's tenant with a live session; otherwise redirects without disclosure. */
type StaffCtx = Awaited<ReturnType<typeof getTenantStaffContext>>;

/**
 * Pass `{ touch: false }` from shared layouts and from guards that still have to authorize the request: the caller
 * then renews the session itself once the request is fully authorized, so a denied request never counts.
 */
export async function requireStaff(opts: { touch?: boolean } = {}) {
  const tenant = await requireTenant();
  const supabase = await createSupabaseServerClient("portal");
  let ctx: StaffCtx;
  try {
    ctx = await getTenantStaffContext(tenant, supabase);
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    if (e.code === "suspended") redirect("/suspended");
    if (e.code === "forbidden") redirect("/forbidden");
    if (e.code === "session_expired") redirect("/login?reason=expired");
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
  const perms = await loadEffectivePermissions(ctx);
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
