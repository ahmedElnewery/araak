import "server-only";
import { dir, getDictionary, type Locale } from "@workspace/i18n";
import { getPreferences } from "./preferences";

/** Signed-in preference, then the `locale` cookie, then Arabic (FR-038). */
export async function getLocale(): Promise<Locale> {
  return (await getPreferences()).locale;
}

export async function getI18n() {
  const { locale, theme } = await getPreferences();
  return { locale, theme, dir: dir(locale), t: getDictionary(locale) };
}
