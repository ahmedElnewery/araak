"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, revokeSessions } from "@workspace/auth/server";

/** Revokes the current registry session and provider session, then clears the cookies. */
export async function signOutAction() {
  const supabase = await createSupabaseServerClient("admin");
  const { data } = await supabase.auth.getClaims();
  const sessionId = data?.claims.session_id;
  if (typeof sessionId === "string") await revokeSessions({ providerSessionIds: [sessionId] }, "sign_out").catch(() => undefined);
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login");
}
