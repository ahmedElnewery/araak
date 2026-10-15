import { RESERVED_SUBDOMAINS } from "./reserved-subdomains";

// Identical to the CHECK on public.tenants.subdomain: lowercase DNS label, 1-63 chars, no edge hyphens.
export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type SubdomainResult = { ok: true } | { ok: false; reason: "invalid" | "reserved" };

export function validateSubdomain(value: string): SubdomainResult {
  if (!SUBDOMAIN_PATTERN.test(value)) return { ok: false, reason: "invalid" };
  if (RESERVED_SUBDOMAINS.includes(value)) return { ok: false, reason: "reserved" };
  return { ok: true };
}
