export type SearchParams = Record<string, string | string[] | undefined>;
export type TenantState = "active" | "suspended";
export type TenantDirection = "asc" | "desc";
/** Search, state and name order of the organization list, as query parameters. The list is short: no paging. */
export type TenantFilters = { q: string | null; state: TenantState | null; dir: TenantDirection };

export type TenantRow = {
  id: string;
  display_name: string;
  subdomain: string;
  state: TenantState;
  created_at: string;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Malformed values are dropped, never echoed. */
export function parseTenantFilters(sp: SearchParams): TenantFilters {
  const state = one(sp.state);
  return {
    q: one(sp.q)?.trim().slice(0, 100) || null,
    state: state === "active" || state === "suspended" ? state : null,
    dir: one(sp.dir) === "desc" ? "desc" : "asc",
  };
}

/** The query string of a filter state (ascending order is implicit), with optional overrides for links. */
export function tenantQuery(f: TenantFilters, overrides: Partial<TenantFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.q) p.set("q", v.q);
  if (v.state) p.set("state", v.state);
  if (v.dir === "desc") p.set("dir", "desc");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * The list as the filters ask for it. `platform_list_tenants` already returns only metadata the viewer may see, so
 * this only narrows and orders that list; case-insensitive on the name and the subdomain.
 */
export function applyTenantFilters<T extends TenantRow>(rows: T[], f: TenantFilters, locale: string): T[] {
  const needle = f.q?.toLocaleLowerCase(locale);
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return rows
    .filter((r) => (f.state === null ? true : r.state === f.state))
    .filter((r) => !needle || [r.display_name, r.subdomain].some((s) => s.toLocaleLowerCase(locale).includes(needle)))
    .sort((a, b) => collator.compare(a.display_name, b.display_name) * (f.dir === "desc" ? -1 : 1));
}
