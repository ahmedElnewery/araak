import "server-only";
import { redirect } from "next/navigation";
import { AuthError, createSupabaseServerClient, getPlatformAdminContext, recordPlatformAudit } from "@workspace/auth/server";
import type { PlatformCapability } from "@workspace/authorization";

/** Any enabled platform admin with a live platform session. Redirects guests to /login. */
export async function requirePlatformSession() {
  const supabase = await createSupabaseServerClient("admin");
  try {
    return await getPlatformAdminContext(supabase);
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    redirect(e.code === "forbidden" ? "/forbidden" : "/login");
  }
}

/** Enabled platform admin with a live platform session and the required capability. */
export async function requirePlatformAdmin(capability: PlatformCapability) {
  const ctx = await requirePlatformSession();
  if (!ctx.capabilities.includes(capability)) {
    await recordPlatformAudit({ adminId: ctx.authUserId, event: "authz.denied", metadata: { capability } }).catch(() => undefined);
    redirect("/forbidden");
  }
  return ctx;
}
