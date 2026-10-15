import "server-only";
import { createHmac } from "node:crypto";

/**
 * The client IP, trusted ONLY behind a known number of proxies. With `trustedProxyHops = 0` the forwarded header is
 * attacker-controlled, so no address is returned and the per-IP throttle is skipped. With N hops the client is the
 * N-th entry from the right of `x-forwarded-for` (the entry our outermost trusted proxy appended).
 */
export function getClientIp(headers: Pick<Headers, "get">, trustedProxyHops: number): string | null {
  if (trustedProxyHops <= 0) return null;
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[Math.max(0, parts.length - trustedProxyHops)] ?? null;
}

/** HMAC-SHA256 so throttle rows never hold a raw identifier or IP (docs/decisions/auth-abuse-controls.md). */
export function throttleHmac(key: string, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

/** Identifier as the user typed it, folded the way login resolution folds it. */
export function normalizeIdentifier(identifier: string): string {
  return identifier.normalize("NFKC").trim().toLowerCase();
}
