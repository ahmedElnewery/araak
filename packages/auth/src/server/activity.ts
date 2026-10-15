import "server-only";
import type { ServerClient } from "./supabase";

export type ActivityRequest = {
  headers: Pick<Headers, "get">;
  /** Defaults to GET (a page render). */
  method?: string;
  /** Route handlers that poll or refresh in the background set this so they never count as activity (CL-036). */
  passive?: boolean;
};

/**
 * Only a user-initiated request counts: protected navigation, explicit data reads and saves (CL-036).
 * Prefetches, HEAD/OPTIONS and passive routes never renew the 30-day inactivity window.
 */
export function isMeaningfulRequest(req: ActivityRequest): boolean {
  if (req.passive) return false;
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "HEAD" || method === "OPTIONS") return false;
  const h = req.headers;
  if (h.get("next-router-prefetch")) return false;
  const purpose = `${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch")) return false;
  return true;
}

/**
 * Renews the caller's session after a successful authorization. Call it from protected page renders and server
 * actions only, never from middleware. The database refuses dead or unauthorized sessions and throttles to once
 * per 60 s, so a failure here must never change the response.
 */
export async function recordMeaningfulActivity(ctx: { supabase: ServerClient }, req: ActivityRequest): Promise<boolean> {
  if (!isMeaningfulRequest(req)) return false;
  const { data, error } = await ctx.supabase.rpc("touch_session_activity");
  return !error && data;
}
