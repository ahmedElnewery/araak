import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, THEME_COOKIE, resolveLocale, resolveTheme, type Locale, type ThemeMode } from "@workspace/i18n";
import { createSupabaseServerClient } from "@workspace/auth/server";

type Stored = { locale: string | null; theme_mode: string | null } | null;

/**
 * The signed-in person's stored preference (server-side, so it follows them across browsers and devices).
 * Any failure (no session, revoked session, missing row) yields null and the cookie/default applies instead.
 */
const loadStored = cache(async (): Promise<Stored> => {
  try {
    const supabase = await createSupabaseServerClient("portal");
    const { data } = await supabase.auth.getClaims();
    if (typeof data?.claims.sub !== "string") return null;
    const { data: prefs, error } = await supabase.rpc("get_my_preferences");
    return error ? null : (prefs as Stored);
  } catch {
    return null;
  }
});

/** Stored preference first, then the cookie (guests), then Arabic / System (FR-038, FR-039). */
export const getPreferences = cache(async (): Promise<{ locale: Locale; theme: ThemeMode }> => {
  const [store, stored] = await Promise.all([cookies(), loadStored()]);
  return {
    locale: resolveLocale({ stored: stored?.locale ?? null, cookie: store.get(LOCALE_COOKIE)?.value ?? null }),
    theme: resolveTheme({ stored: stored?.theme_mode ?? null, cookie: store.get(THEME_COOKIE)?.value ?? null }),
  };
});
