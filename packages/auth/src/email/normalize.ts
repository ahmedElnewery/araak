// Same explicit whitespace set as private.normalize_email (supabase/migrations/*_normalize_email_whitespace.sql).
const EDGE_WHITESPACE = /^[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$/g;

/**
 * Identical to private.normalize_email (R-01): trim edge whitespace + lowercase ASCII letters of the full address.
 * No dot/plus stripping and no alias generation: Supabase Auth treats those as distinct identities.
 */
export function normalizeEmail(email: string): string {
  return email.replace(EDGE_WHITESPACE, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** Accepted addresses are printable ASCII with one @ (matches the database CHECK); anything else is rejected up front. */
export function isAcceptableEmail(email: string): boolean {
  const n = normalizeEmail(email);
  return n.length <= 254 && /^[!-~]+@[!-~]+$/.test(n) && n.split("@").length === 2;
}
