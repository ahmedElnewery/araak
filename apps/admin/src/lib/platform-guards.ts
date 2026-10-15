import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AuthError, createSupabaseServerClient, getPlatformAdminContext, recordMeaningfulActivity, recordPlatformAudit,
  type PlatformAdminContext,
} from "@workspace/auth/server";
import type { PlatformCapability } from "@workspace/authorization";

/** The tenant capabilities that open the tenant list and a tenant's page (each panel checks its own capability). */
export const TENANT_CAPABILITIES = ["tenants.manage", "tenants.managers.manage", "tenants.staff.manage"] as const satisfies readonly PlatformCapability[];

/** Where a platform admin lands after sign-in: the first area their capabilities open. */
export function landingPath(capabilities: readonly string[]): string {
  if (TENANT_CAPABILITIES.some((c) => capabilities.includes(c))) return "/tenants";
  if (capabilities.includes("platform_admins.invite")) return "/admins";
  return "/forbidden";
}

/** One verified context per request: the layout and the page share it instead of re-running the guard pipeline. */
const loadContext = cache(async (): Promise<PlatformAdminContext | AuthError> => {
  const supabase = await createSupabaseServerClient("admin");
  try {
    return await getPlatformAdminContext(supabase);
  } catch (e) {
    if (e instanceof AuthError) return e;
    throw e;
  }
});

/**
 * Any enabled platform admin with a live platform session. Redirects guests to /login. Pass `{ touch: false }` from
 * the shared layout: the page's own guard renews the session once the request is fully authorized (CL-036).
 */
export async function requirePlatformSession(opts: { touch?: boolean } = {}) {
  const ctx = await loadContext();
  if (ctx instanceof AuthError) redirect(ctx.code === "forbidden" ? "/forbidden" : "/login");
  if (opts.touch !== false) await renewSession(ctx);
  return ctx;
}

/** Enabled platform admin with a live platform session and the required capability. */
export async function requirePlatformAdmin(capability: PlatformCapability) {
  return requirePlatformAdminAny([capability]);
}

/** Enabled platform admin with a live platform session and at least one of the capabilities. */
export async function requirePlatformAdminAny(capabilities: readonly PlatformCapability[]) {
  const ctx = await requirePlatformSession({ touch: false });
  if (!capabilities.some((c) => ctx.capabilities.includes(c))) {
    await recordPlatformAudit({ adminId: ctx.authUserId, event: "authz.denied", metadata: { capability: capabilities.join("|") } }).catch(() => undefined);
    redirect("/forbidden");
  }
  await renewSession(ctx);
  return ctx;
}

/**
 * Renews the 30-day inactivity window once per request, after authorization succeeded (FR-018). Prefetches and passive
 * requests are skipped inside `recordMeaningfulActivity`; a failure never changes the response.
 */
const touchState = cache(() => ({ started: false }));
async function renewSession(ctx: PlatformAdminContext): Promise<void> {
  const state = touchState();
  if (state.started) return;
  state.started = true;
  await recordMeaningfulActivity(ctx, { headers: await headers() }).catch(() => undefined);
}
