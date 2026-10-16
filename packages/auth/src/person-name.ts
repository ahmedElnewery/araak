export const PERSON_NAME_MAX = 50;
export type PersonNameError = "required" | "invalid";
export type PersonNameResult = { ok: true; value: string } | { ok: false; code: PersonNameError };

// Letters and marks of any script (Arabic or Latin), starting with a letter; spaces, apostrophes, hyphens and dots
// may follow (Abd Allah, O'Neil, Jean-Luc, St. John). No digits, markup or control characters.
const PERSON_NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;

/**
 * A staff member's first or last name: trimmed, inner whitespace collapsed to one space, 1 to 50 characters.
 * The database (private.valid_person_name) applies a looser backstop to the value this returns.
 */
export function validatePersonName(raw: string): PersonNameResult {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value === "") return { ok: false, code: "required" };
  if (Array.from(value).length > PERSON_NAME_MAX || !PERSON_NAME_RE.test(value)) return { ok: false, code: "invalid" };
  return { ok: true, value };
}

/** "First Last", or null for an account activated before names were collected that has not added them yet. */
export function personFullName(s: { firstName?: string | null; lastName?: string | null }): string | null {
  return s.firstName && s.lastName ? `${s.firstName} ${s.lastName}` : null;
}
