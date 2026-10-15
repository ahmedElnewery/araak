export type Locale = "ar" | "en";
export type Rendered = { subject: string; text: string; html: string };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Plain, brand-free layout: only the supplied organization name appears; no provider name, logo or "Powered by". */
export function layout(locale: Locale, bodyHtml: string): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:Arial,sans-serif;line-height:1.6">${bodyHtml}</body></html>`;
}
