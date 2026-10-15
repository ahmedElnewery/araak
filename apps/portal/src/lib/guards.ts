import "server-only";
import { redirect } from "next/navigation";
import { AuthError, createSupabaseServerClient, getTenantStaffContext, recordSecurityEvent } from "@workspace/auth/server";
import { can, loadEffectivePermissions, type PermissionKey, type RecordScope } from "@workspace/authorization";
import { requireTenant } from "./tenant-context";

async function deny(ctx: { tenantId: string; staffId: string }, reason: string): Promise<never> {
  // Best effort: a logging failure must never turn a denial into access.
  await recordSecurityEvent({ tenantId: ctx.tenantId, staffId: ctx.staffId, event: "authz.denied", metadata: { reason } }).catch(() => undefined);
  redirect("/forbidden");
}

/** Signed-in, enabled staff of THIS host's tenant with a live session; otherwise redirects without disclosure. */
export async function requireStaff() {
  const tenant = await requireTenant();
  const supabase = await createSupabaseServerClient("portal");
  try {
    return await getTenantStaffContext(tenant, supabase);
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    if (e.code === "suspended") redirect("/suspended");
    if (e.code === "forbidden") redirect("/forbidden");
    redirect("/login");
  }
}

export async function requirePermission(key: PermissionKey, scope?: RecordScope) {
  const ctx = await requireStaff();
  const perms = await loadEffectivePermissions(ctx);
  if (!can(perms, key, scope)) return deny(ctx, `permission:${key}`);
  return { ...ctx, permissions: perms };
}

/** Protected tenant-manager authority (branding, Security Log, resend, manager-assisted reset). */
export async function requireManager() {
  const ctx = await requireStaff();
  if (!ctx.isManager) return deny(ctx, "manager_only");
  return ctx;
}
