import type { PlatformAuditEventName } from "@workspace/i18n";

export type SearchParams = Record<string, string | string[] | undefined>;
export type PlatformAuditFilters = { event: string | null; from: string | null; to: string | null; q: string | null; page: number };

export const PAGE_SIZE = 25;
/** The event types offered as a filter; any other stored event still lists under "All events". */
export const PLATFORM_EVENTS = [
  "tenant.created", "tenant.suspended", "tenant.activated", "tenant.name_updated", "tenant.logo_updated", "manager.granted",
  "manager.invited", "manager.revoked", "platform_admin.invited", "platform_admin.invitation_accepted",
  "platform_admin.invitation_rejected", "platform_admin.bootstrapped", "platform_admin.revoked_by_ops", "auth.sign_in_failed",
  "authz.denied", "retention.purged", "restore.rehearsed",
] as const satisfies readonly PlatformAuditEventName[];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
function date(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** Malformed values are dropped, never echoed or passed to the database. */
export function parsePlatformAuditFilters(sp: SearchParams): PlatformAuditFilters {
  const event = one(sp.event);
  return {
    event: event && (PLATFORM_EVENTS as readonly string[]).includes(event) ? event : null,
    from: date(one(sp.from)), to: date(one(sp.to)), q: one(sp.q)?.trim().slice(0, 100) || null,
    page: Math.min(10_000, Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1)),
  };
}

/** Whole UTC days, both ends inclusive. */
export function platformAuditRpcArgs(f: PlatformAuditFilters) {
  return {
    p_event: f.event ?? undefined, p_search: f.q ?? undefined,
    p_from: f.from ? `${f.from}T00:00:00.000Z` : undefined, p_to: f.to ? `${f.to}T23:59:59.999Z` : undefined,
    p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE,
  };
}

export function platformAuditQuery(f: PlatformAuditFilters, page = f.page): string {
  const p = new URLSearchParams();
  if (f.event) p.set("event", f.event);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.q) p.set("q", f.q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
