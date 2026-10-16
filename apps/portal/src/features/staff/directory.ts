import { staffName } from "@workspace/ui/components/staff-name";
import type { SearchParams } from "@/features/audit/filters";

export type StaffState = "enabled" | "disabled";
export type StaffDirection = "asc" | "desc";
/** Search, state and name order of the staff directory, as query parameters (page 1 of a short list: no paging). */
export type StaffFilters = { q: string | null; state: StaffState | null; dir: StaffDirection };

export type DirectoryRow = {
  id: string; username: string; firstName: string | null; lastName: string | null; email: string; enabled: boolean; isManager: boolean;
  roles: { id: string; name: string }[];
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Malformed values are dropped, never echoed. */
export function parseStaffFilters(sp: SearchParams): StaffFilters {
  const state = one(sp.state);
  return {
    q: one(sp.q)?.trim().slice(0, 100) || null,
    state: state === "enabled" || state === "disabled" ? state : null,
    dir: one(sp.dir) === "desc" ? "desc" : "asc",
  };
}

/** The query string of a filter state (ascending order is implicit), with optional overrides for links. */
export function staffQuery(f: StaffFilters, overrides: Partial<StaffFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.q) p.set("q", v.q);
  if (v.state) p.set("state", v.state);
  if (v.dir === "desc") p.set("dir", "desc");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * The directory as the filters ask for it. The list is already authorized and complete (one tenant's staff), so this
 * only narrows and orders what the viewer may see; case-insensitive on the name, username and email.
 */
export function applyStaffFilters<T extends DirectoryRow>(rows: T[], f: StaffFilters, locale: string): T[] {
  const needle = f.q?.toLocaleLowerCase(locale);
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return rows
    .filter((r) => (f.state === null ? true : r.enabled === (f.state === "enabled")))
    .filter((r) => !needle || [staffName(r), r.username, r.email].some((s) => s.toLocaleLowerCase(locale).includes(needle)))
    .sort((a, b) => collator.compare(staffName(a), staffName(b)) * (f.dir === "desc" ? -1 : 1));
}
