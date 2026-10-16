import { isAuditCategory, isSecurityEventType, type AuditCategory, type SecurityEventType } from "@workspace/authorization";

/** Query parameters as Next passes them to a page, or read from a route handler's URL. */
export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 25;
const MAX_PAGE = 10_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditFilters = {
  /** Empty means every category the viewer holds; the database intersects either way. */
  categories: AuditCategory[]; from: string | null; to: string | null; actor: string | null; q: string | null; page: number;
};
export type SecurityFilters = { event: SecurityEventType | null; from: string | null; to: string | null; q: string | null; page: number };

const all = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined): string | undefined => all(v)[0];

/** A real calendar date (YYYY-MM-DD) or null. */
function date(v: string | undefined): string | null {
  if (!v || !DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}
const search = (v: string | undefined) => v?.trim().slice(0, 100) || null;
const page = (v: string | undefined) => Math.min(MAX_PAGE, Math.max(1, Number.parseInt(v ?? "1", 10) || 1));

export function searchParamsOf(url: URL): SearchParams {
  const out: SearchParams = {};
  for (const key of new Set(url.searchParams.keys())) out[key] = url.searchParams.getAll(key);
  return out;
}

/** Malformed values are dropped, never echoed or passed to the database. */
export function parseAuditFilters(sp: SearchParams): AuditFilters {
  const actor = one(sp.actor);
  return {
    categories: [...new Set(all(sp.category).filter(isAuditCategory))],
    from: date(one(sp.from)), to: date(one(sp.to)), actor: actor && UUID.test(actor) ? actor.toLowerCase() : null,
    q: search(one(sp.q)), page: page(one(sp.page)),
  };
}

export function parseSecurityFilters(sp: SearchParams): SecurityFilters {
  const event = one(sp.event);
  return { event: event && isSecurityEventType(event) ? event : null, from: date(one(sp.from)), to: date(one(sp.to)), q: search(one(sp.q)), page: page(one(sp.page)) };
}

// Dates are whole days in UTC, both ends inclusive (the database compares `>= from` and `<= to`).
const range = (f: { from: string | null; to: string | null }) => ({
  p_from: f.from ? `${f.from}T00:00:00.000Z` : undefined,
  p_to: f.to ? `${f.to}T23:59:59.999Z` : undefined,
});

export function auditRpcFilters(f: AuditFilters) {
  return { p_categories: f.categories.length > 0 ? f.categories : undefined, ...range(f), p_actor: f.actor ?? undefined, p_search: f.q ?? undefined };
}

export function securityRpcFilters(f: SecurityFilters) {
  return { ...range(f), p_event: f.event ?? undefined, p_search: f.q ?? undefined };
}

export const pageArgs = (f: { page: number }) => ({ p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE });

/** The query string of a filter state (page 1 is implicit), with optional overrides for links. */
export function auditQuery(f: AuditFilters, overrides: Partial<AuditFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  for (const c of v.categories) p.append("category", c);
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.actor) p.set("actor", v.actor);
  if (v.q) p.set("q", v.q);
  if (v.page > 1) p.set("page", String(v.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function securityQuery(f: SecurityFilters, overrides: Partial<SecurityFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.event) p.set("event", v.event);
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.q) p.set("q", v.q);
  if (v.page > 1) p.set("page", String(v.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** The id of the event whose details are open (`?event_id=`), or null. */
export function openEventId(sp: SearchParams): number | null {
  const v = one(sp.event_id);
  return v && /^\d{1,15}$/.test(v) ? Number(v) : null;
}

/** A list URL's query string with the details of one event open. */
export function withEventId(query: string, id: number): string {
  return `${query ? `${query}&` : "?"}event_id=${String(id)}`;
}
