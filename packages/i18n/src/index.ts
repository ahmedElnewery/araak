export {
  LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, dir, type Locale,
  THEME_MODES, DEFAULT_THEME, THEME_COOKIE, PREFERENCE_COOKIE_MAX_AGE, isThemeMode, type ThemeMode,
} from "./config";
export type { Dictionary } from "./dictionaries/types";
export { getDictionary } from "./get-dictionary";
export { resolveLocale, resolveTheme } from "./resolve-locale";
export { formatDate, formatDateTime, formatNumber } from "./format";
