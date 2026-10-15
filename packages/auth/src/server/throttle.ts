import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getClientIp, normalizeIdentifier, throttleHmac } from "./client-ip";

export type ThrottleKind = "sign_in" | "recovery" | "platform_sign_in";
/** Throttle scope of the platform-admin sign-in (no tenant): its counters never mix with a tenant's. */
export const PLATFORM_THROTTLE_SCOPE = "00000000-0000-0000-0000-000000000000";
export type ThrottleKeys = { tenantId: string; kind: ThrottleKind; identifierHmac: string; clientIpHmac: string | null };

export function buildThrottleKeys(args: {
  tenantId: string; kind: ThrottleKind; identifier: string; headers: Pick<Headers, "get">;
  hmacKey: string; trustedProxyHops: number;
}): ThrottleKeys {
  const ip = getClientIp(args.headers, args.trustedProxyHops);
  return {
    tenantId: args.tenantId,
    kind: args.kind,
    identifierHmac: throttleHmac(args.hmacKey, `${args.tenantId}:${normalizeIdentifier(args.identifier)}`),
    clientIpHmac: ip ? throttleHmac(args.hmacKey, ip) : null,
  };
}

/** True when the attempt may proceed. Fails CLOSED: a database error counts as throttled. */
export async function checkAndRecordAttempt(k: ThrottleKeys): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("svc_check_and_record_auth_attempt", {
    p_tenant_id: k.tenantId, p_kind: k.kind, p_identifier_hmac: k.identifierHmac, p_client_ip_hmac: k.clientIpHmac as string,
  });
  return !error && data;
}

export async function recordAuthSuccess(k: ThrottleKeys): Promise<void> {
  await getSupabaseAdmin()
    .rpc("svc_record_auth_success", { p_tenant_id: k.tenantId, p_kind: k.kind, p_identifier_hmac: k.identifierHmac })
    .then(() => undefined, () => undefined);
}
