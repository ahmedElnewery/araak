"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/guards";
import { toErrorCode, type ErrorCode } from "@/lib/rpc-error";

export type SessionActionResult = { ok?: true; error?: ErrorCode };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Revokes one OTHER session of the caller. A double submit finds it already gone, which counts as success (FR-020). */
export async function revokeSessionAction(sessionId: string): Promise<SessionActionResult> {
  const ctx = await requireStaff();
  if (!uuid.test(sessionId)) return { error: "session_not_found" };
  const { error } = await ctx.supabase.rpc("revoke_my_session", { p_session_id: sessionId });
  if (error) {
    const code = toErrorCode(error);
    if (code !== "session_not_found") return { error: code };
  }
  revalidatePath("/account/sessions");
  return { ok: true };
}

/** Revokes every other session; the current one stays. Idempotent: repeating it revokes nothing more. */
export async function revokeOtherSessionsAction(): Promise<SessionActionResult> {
  const ctx = await requireStaff();
  const { error } = await ctx.supabase.rpc("revoke_my_other_sessions", { p_reason: "user_all_others" });
  if (error) return { error: toErrorCode(error) };
  revalidatePath("/account/sessions");
  return { ok: true };
}
