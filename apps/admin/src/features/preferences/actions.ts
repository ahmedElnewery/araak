"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  LOCALE_COOKIE, PREFERENCE_COOKIE_MAX_AGE, THEME_COOKIE, isLocale, isThemeMode, type Locale, type ThemeMode,
} from "@workspace/i18n";

/** Cookie persistence for the admin app's language and theme (FR-039). Values are validated against the allowlists. */
export async function setPreferencesAction(input: { locale?: Locale; theme?: ThemeMode }): Promise<void> {
  const store = await cookies();
  const opts = { path: "/", sameSite: "lax", maxAge: PREFERENCE_COOKIE_MAX_AGE } as const;
  if (isLocale(input.locale)) store.set(LOCALE_COOKIE, input.locale, opts);
  if (isThemeMode(input.theme)) store.set(THEME_COOKIE, input.theme, opts);
  revalidatePath("/", "layout");
}
