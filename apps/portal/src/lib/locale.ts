import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, dir, getDictionary, resolveLocale, type Locale } from "@workspace/i18n";

/** Guests have no stored preference: cookie, then Arabic. Signed-in preference joins here in the shell story. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale({ cookie: store.get(LOCALE_COOKIE)?.value ?? null });
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, dir: dir(locale), t: getDictionary(locale) };
}
