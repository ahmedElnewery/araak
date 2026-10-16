import { DEFAULT_LOCALE, DEFAULT_THEME, isLocale, isThemeMode, type Locale, type ThemeMode } from "./config";

/** stored user preference -> `locale` cookie -> Arabic (FR-038). Invalid values are ignored. */
export function resolveLocale(input: { stored?: string | null; cookie?: string | null }): Locale {
  if (isLocale(input.stored)) return input.stored;
  if (isLocale(input.cookie)) return input.cookie;
  return DEFAULT_LOCALE;
}

/** stored user preference -> `theme` cookie -> Light (FR-039). Invalid values are ignored. */
export function resolveTheme(input: { stored?: string | null; cookie?: string | null }): ThemeMode {
  if (isThemeMode(input.stored)) return input.stored;
  if (isThemeMode(input.cookie)) return input.cookie;
  return DEFAULT_THEME;
}
