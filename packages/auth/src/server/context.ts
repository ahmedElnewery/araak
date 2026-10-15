import "server-only";
import { AuthError } from "../errors";
import type { ServerClient } from "./supabase";
import { getSupabaseAdmin } from "./supabase-admin";

export type HostTenant = { id: string };

export type TenantStaffContext = {
  authUserId: string;
  sessionId: string;
  tenantId: string;
  staffId: string;
  username: string;
  email: string;
  isManager: boolean;
  supabase: ServerClient;
};

export type PlatformAdminContext = {
  authUserId: string;
  sessionId: string;
  capabilities: string[];
  supabase: ServerClient;
};

type StaffRow = {
  staffId: string; tenantId: string; username: string; email: string; enabled: boolean;
  tenantState: "active" | "suspended"; sessionLive: boolean; isManager: boolean;
};
type PlatformRow = { platformAdminId: string; enabled: boolean; capabilities: string[]; sessionLive: boolean };

async function verifiedClaims(supabase: ServerClient) {
  const { data, error } = await supabase.auth.getClaims(); // verifies the JWT, never trusts the cookie blindly
  const sub = data?.claims.sub;
  const sessionId = data?.claims.session_id;
  if (error || typeof sub !== "string" || typeof sessionId !== "string") throw new AuthError("unauthenticated");
  return { sub, sessionId };
}

/**
 * Guard pipeline for tenant staff (FR-006, FR-022). A user of ANOTHER tenant, or an identity without a staff row,
 * is reported as `unauthenticated` so nothing about other tenants is disclosed.
 */
export async function getTenantStaffContext(hostTenant: HostTenant, supabase: ServerClient): Promise<TenantStaffContext> {
  const { sub, sessionId } = await verifiedClaims(supabase);
  const { data, error } = await getSupabaseAdmin().rpc("svc_load_staff_context", { p_auth_user_id: sub, p_session_id: sessionId });
  if (error) throw new AuthError("unauthenticated");
  const row = data as StaffRow | null;
  if (!row || row.tenantId !== hostTenant.id) throw new AuthError("unauthenticated");
  if (row.tenantState !== "active") throw new AuthError("suspended");
  if (!row.enabled) throw new AuthError("forbidden");
  if (!row.sessionLive) throw new AuthError("session_expired");
  return { authUserId: sub, sessionId, tenantId: row.tenantId, staffId: row.staffId, username: row.username,
           email: row.email, isManager: row.isManager, supabase };
}

export async function getPlatformAdminContext(supabase: ServerClient): Promise<PlatformAdminContext> {
  const { sub, sessionId } = await verifiedClaims(supabase);
  const { data, error } = await getSupabaseAdmin().rpc("svc_load_platform_context", { p_auth_user_id: sub, p_session_id: sessionId });
  if (error) throw new AuthError("unauthenticated");
  const row = data as PlatformRow | null;
  if (!row) throw new AuthError("unauthenticated");
  if (!row.enabled) throw new AuthError("forbidden");
  if (!row.sessionLive) throw new AuthError("session_expired");
  return { authUserId: sub, sessionId, capabilities: row.capabilities, supabase };
}
