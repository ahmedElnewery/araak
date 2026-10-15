import type { Locale } from "./config";

// Always pass an explicit locale; no implicit runtime default and no currency inference (Constitution VIII).
// Latin digits are used in both locales so identifiers and amounts stay unambiguous.
const tag = (locale: Locale) => `${locale}-u-nu-latn`;

// The server does not know the viewer's time zone: it renders UTC, and client components pass the viewer's zone once
// it is known (`useTimeZone` in @workspace/ui). A time of day always names its zone, so UTC is never mistaken for local.
export function formatDate(
  value: Date | number | string, locale: Locale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }, timeZone = "UTC",
): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone, ...options }).format(new Date(value));
}

export function formatDateTime(value: Date | number | string, locale: Locale, timeZone = "UTC"): string {
  return formatDate(value, locale,
    { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }, timeZone);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(tag(locale), options).format(value);
}
