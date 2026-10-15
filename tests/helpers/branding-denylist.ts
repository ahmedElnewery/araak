// Strings that must never appear in tenant-facing output (FR-035, FR-037, Constitution IX). The product/provider
// denylist applies on every tenant; the platform-operator name only on tenants that are not that operator (the Araak
// organization, display name "أراك", at portal.<domain>).
export const PROVIDER_DENYLIST = ["supabase", "vercel", "next.js", "powered by", "charity-portal", "charity portal"] as const;
export const OPERATOR_NAMES = ["araak", "أراك", "ERAK", "إراك"] as const;

export function findDenied(text: string, opts: { operatorAllowed?: boolean } = {}): string[] {
  const hay = text.toLowerCase();
  const terms = [...PROVIDER_DENYLIST, ...(opts.operatorAllowed ? [] : OPERATOR_NAMES)];
  return terms.filter((t) => hay.includes(t.toLowerCase()));
}
