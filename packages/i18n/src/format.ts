import type { Locale } from "./config";

// Always pass an explicit locale; no implicit runtime default and no currency inference (Constitution VIII).
// Latin digits are used in both locales so identifiers and amounts stay unambiguous.
const tag = (locale: Locale) => `${locale}-u-nu-latn`;

export function formatDate(value: Date | number | string, locale: Locale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: "UTC", ...options }).format(new Date(value));
}

export function formatDateTime(value: Date | number | string, locale: Locale): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(tag(locale), options).format(value);
}
