"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, getTenantStaffContext, revokeSessions } from "@workspace/auth/server";
import { requireTenant } from "@/lib/tenant-context";

/** Ends the current registry session (and its provider session), then clears the local cookie. */
export async function signOutAction(): Promise<void> {
  const tenant = await requireTenant();
  const supabase = await createSupabaseServerClient("portal");
  const ctx = await getTenantStaffContext(tenant, supabase).catch(() => null);
  if (ctx) await revokeSessions({ providerSessionIds: [ctx.sessionId] }, "sign_out").catch(() => undefined);
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login");
}
