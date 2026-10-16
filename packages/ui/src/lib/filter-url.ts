/** Entries worth sending: values are trimmed (the server trims too) and empty ones — "All", a blank search — are dropped. */
function meaningful(entries: Iterable<[string, FormDataEntryValue]>): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, value] of entries) {
    const v = typeof value === "string" ? value.trim() : "";
    if (v) out.push([name, v]);
  }
  return out;
}

const canonical = (entries: [string, string][]) => entries.map(([k, v]) => `${k}=${v}`).sort().join("&");

/**
 * Where applying a filter form should go, or null when it would land on the page already open. The URL is built only
 * from the fields that say something, so "nothing chosen" is `/list`, never `/list?q=&state=`; and `current` (the
 * present query string) is compared the same way, so re-applying the same filters costs no request.
 */
export function filterTarget(action: string, fields: Iterable<[string, FormDataEntryValue]>, current: string): string | null {
  const next = meaningful(fields);
  const now = meaningful(new URLSearchParams(current));
  if (canonical(next) === canonical(now)) return null;
  const query = new URLSearchParams(next).toString();
  return query ? `${action}?${query}` : action;
}
