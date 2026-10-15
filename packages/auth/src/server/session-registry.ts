import "server-only";
import { UAParser } from "ua-parser-js";
import type { Database } from "@workspace/db";
import type { ServerClient } from "./supabase";
import { getSupabaseAdmin } from "./supabase-admin";

export type SessionOwner =
  | { kind: "staff"; authUserId: string; tenantId: string; staffId: string }
  | { kind: "platform_admin"; authUserId: string };

export type RevokeReason =
  | "user" | "user_all_others" | "password_change" | "recovery" | "admin_reset"
  | "disabled" | "manager_demoted" | "platform_revoked" | "sign_out";

/** Coarse device type and browser only. No IP, location or raw user-agent string is stored (CL-037). */
export function describeDevice(userAgent: string | null | undefined): { deviceType: string | null; browser: string | null } {
  if (!userAgent) return { deviceType: null, browser: null };
  const r = new UAParser(userAgent).getResult();
  const known = ["mobile", "tablet", "smarttv", "wearable", "console", "xr", "embedded"];
  const deviceType = r.device.type && known.includes(r.device.type) ? r.device.type : r.browser.name ? "desktop" : null;
  return { deviceType, browser: r.browser.name ?? null };
}

/** Records the provider session behind the verified `session_id` claim. Call once, right after sign-in. */
export async function registerSession(args: { supabase: ServerClient; owner: SessionOwner; userAgent?: string | null }) {
  const { data, error } = await args.supabase.auth.getClaims();
  const sessionId = data?.claims.session_id;
  if (error || !data || typeof sessionId !== "string" || data.claims.sub !== args.owner.authUserId) {
    throw new Error("session_claims_unavailable");
  }
  const { deviceType, browser } = describeDevice(args.userAgent);
  const base = {
    provider_session_id: sessionId,
    auth_user_id: args.owner.authUserId,
    verified_activity_at: new Date().toISOString(),
    device_type: deviceType,
    browser,
  };
  const row: Database["public"]["Tables"]["session_registry"]["Insert"] =
    args.owner.kind === "staff"
      ? { ...base, tenant_id: args.owner.tenantId, staff_id: args.owner.staffId }
      : { ...base, platform_admin_id: args.owner.authUserId };
  const { error: insertError } = await getSupabaseAdmin().from("session_registry").insert(row);
  if (insertError) throw new Error("session_registration_failed");
  return { providerSessionId: sessionId };
}

export type RevokeFilter =
  | { providerSessionIds: string[] }
  | { authUserId: string; exceptProviderSessionId?: string };

/** Revokes sessions in the registry AND deletes the provider sessions in one transaction (proven in R-03). */
export async function revokeSessions(filter: RevokeFilter, reason: RevokeReason): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data, error } =
    "providerSessionIds" in filter
      ? await admin.rpc("svc_revoke_sessions", { p_session_ids: filter.providerSessionIds, p_reason: reason })
      : await admin.rpc("svc_revoke_user_sessions", {
          p_auth_user_id: filter.authUserId,
          p_except_session_id: filter.exceptProviderSessionId as string,
          p_reason: reason,
        });
  if (error) throw new Error("session_revocation_failed");
  return data;
}
