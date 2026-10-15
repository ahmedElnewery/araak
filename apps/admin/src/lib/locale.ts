import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, THEME_COOKIE, dir, getDictionary, resolveLocale, resolveTheme } from "@workspace/i18n";

/** The admin app has no per-person stored preference: language and theme persist in cookies (FR-039). */
export async function getPreferences() {
  const store = await cookies();
  return {
    locale: resolveLocale({ cookie: store.get(LOCALE_COOKIE)?.value ?? null }),
    theme: resolveTheme({ cookie: store.get(THEME_COOKIE)?.value ?? null }),
  };
}

export async function getLocale() {
  return (await getPreferences()).locale;
}

export async function getI18n() {
  const { locale, theme } = await getPreferences();
  return { locale, theme, dir: dir(locale), t: getDictionary(locale) };
}
