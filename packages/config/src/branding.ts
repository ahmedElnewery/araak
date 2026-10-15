// Approved branding constraints (docs/decisions/branding.md, GATE-BRAND). Client-safe: constants and pure validators only.

export const LOGO_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoMime = (typeof LOGO_ALLOWED_MIME)[number];
/** Stored extension per sniffed MIME type (SVG is excluded: script/XSS risk). */
export const LOGO_EXTENSION: Record<LogoMime, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_MAX_DIMENSION = 1024;
export const LOGO_MIN_DIMENSION = 64;
export const LOGO_BUCKET = "tenant-logos";

export const DISPLAY_NAME_MAX = 80;
// Unicode letters, marks, digits, spaces and . , - ' & ( ); no control characters or markup.
const DISPLAY_NAME_RE = /^[\p{L}\p{M}\p{N} .,\-'&()]+$/u;

export type DisplayNameError = "name_required" | "name_invalid";

export function validateDisplayName(raw: string): { ok: true; value: string } | { ok: false; code: DisplayNameError } {
  const value = raw.trim();
  if (value === "") return { ok: false, code: "name_required" };
  if (Array.from(value).length > DISPLAY_NAME_MAX || !DISPLAY_NAME_RE.test(value)) return { ok: false, code: "name_invalid" };
  return { ok: true, value };
}

export function isLogoMime(value: string): value is LogoMime {
  return (LOGO_ALLOWED_MIME as readonly string[]).includes(value);
}

export type LogoErrorCode = "logo_type" | "logo_mismatch" | "logo_too_large" | "logo_corrupt" | "logo_dimensions";
