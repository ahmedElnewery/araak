import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/** stored user preference -> `locale` cookie -> Arabic (FR-038). Invalid values are ignored. */
export function resolveLocale(input: { stored?: string | null; cookie?: string | null }): Locale {
  if (isLocale(input.stored)) return input.stored;
  if (isLocale(input.cookie)) return input.cookie;
  return DEFAULT_LOCALE;
}
