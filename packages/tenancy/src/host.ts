import { validateSubdomain } from "./subdomain";

export type HostConfig = {
  /** e.g. `portal.localhost:3000` or `portal.example.org` (port is ignored when matching) */
  portalBaseDomain: string;
  /** exact admin host, e.g. `admin.localhost:3001` */
  adminHost: string;
  /** 0 = never trust forwarded headers */
  trustedProxyHops: number;
};

export type HostClass = { kind: "tenant"; subdomain: string } | { kind: "admin" } | { kind: "invalid" };

type HeaderSource = { get(name: string): string | null };

const INVALID: HostClass = { kind: "invalid" };

/** lowercase, strip port and one trailing dot. Returns null for anything that is not a plain ASCII hostname. */
function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  if (h.startsWith("[") || h.includes("@") || h.includes("/") || h.includes(",") || /\s/.test(h)) return null; // IPv6 literal, userinfo, paths, lists
  const colon = h.lastIndexOf(":");
  if (colon !== -1) {
    if (!/^\d{1,5}$/.test(h.slice(colon + 1))) return null;
    h = h.slice(0, colon);
  }
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (!h || h.endsWith(".") || h.startsWith(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(h)) return null; // non-ASCII / IDN in Unicode form
  const labels = h.split(".");
  if (labels.some((l) => l === "" || l.startsWith("xn--"))) return null; // punycode / empty labels
  if (/^\d+(?:\.\d+){3}$/.test(h)) return null; // IPv4 literal
  return h;
}

function hostFromHeaders(headers: HeaderSource, trustedProxyHops: number): string | null {
  if (trustedProxyHops > 0) {
    const fwd = headers.get("x-forwarded-host");
    if (fwd) {
      // The trusted proxy must overwrite this header (docs/decisions/operations.md). If it appends, the LAST
      // value is the one the trusted proxy wrote; earlier values are client-controlled.
      const parts = fwd.split(",");
      return parts[parts.length - 1]?.trim() ?? null;
    }
  }
  return headers.get("host");
}

/** Server-side host trust (contracts "Host trust"). Anything unexpected is `invalid`. */
export function classifyHost(headers: HeaderSource, config: HostConfig): HostClass {
  const host = normalizeHost(hostFromHeaders(headers, config.trustedProxyHops));
  const base = normalizeHost(config.portalBaseDomain);
  const admin = normalizeHost(config.adminHost);
  if (!host || !base || !admin) return INVALID;
  if (host === admin) return { kind: "admin" };
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return INVALID;
  const subdomain = host.slice(0, -suffix.length);
  if (subdomain.includes(".")) return INVALID; // nested labels
  return validateSubdomain(subdomain).ok ? { kind: "tenant", subdomain } : INVALID;
}
