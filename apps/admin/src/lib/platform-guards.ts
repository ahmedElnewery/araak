import "server-only";
import { redirect } from "next/navigation";
import { AuthError, createSupabaseServerClient, getPlatformAdminContext, recordPlatformAudit } from "@workspace/auth/server";
import type { PlatformCapability } from "@workspace/authorization";

/** Enabled platform admin with a live platform session and the required capability. */
export async function requirePlatformAdmin(capability: PlatformCapability) {
  const supabase = await createSupabaseServerClient("admin");
  try {
    const ctx = await getPlatformAdminContext(supabase);
    if (!ctx.capabilities.includes(capability)) {
      await recordPlatformAudit({ adminId: ctx.authUserId, event: "authz.denied", metadata: { capability } }).catch(() => undefined);
      redirect("/forbidden");
    }
    return ctx;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    redirect(e.code === "forbidden" ? "/forbidden" : "/login");
  }
}
