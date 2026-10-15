"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, getTenantStaffContext } from "@workspace/auth/server";
import { logger } from "@workspace/config/server";
import {
  LOCALE_COOKIE, PREFERENCE_COOKIE_MAX_AGE, THEME_COOKIE, isLocale, isThemeMode, type Locale, type ThemeMode,
} from "@workspace/i18n";
import { getPreferences } from "@/lib/preferences";
import { requireTenant } from "@/lib/tenant-context";

/**
 * Persists language and/or theme. Cookies always (so the login page matches); signed-in staff also write the
 * server-side preference, which then follows them to other browsers (FR-039).
 */
export async function setPreferencesAction(input: { locale?: Locale; theme?: ThemeMode }): Promise<void> {
  const locale = isLocale(input.locale) ? input.locale : undefined;
  const theme = isThemeMode(input.theme) ? input.theme : undefined;
  if (!locale && !theme) return;
  // what the person sees right now (stored -> cookie -> default), read before the cookies change
  const current = await getPreferences();
  const store = await cookies();
  const opts = { path: "/", sameSite: "lax", maxAge: PREFERENCE_COOKIE_MAX_AGE } as const;
  if (locale) store.set(LOCALE_COOKIE, locale, opts);
  if (theme) store.set(THEME_COOKIE, theme, opts);

  const tenant = await requireTenant();
  const supabase = await createSupabaseServerClient("portal");
  const ctx = await getTenantStaffContext(tenant, supabase).catch(() => null);
  if (ctx) {
    // Both values, always: an omitted argument is dropped from the JSON body (the RPC then no longer resolves), and
    // the first stored row must keep the other preference the person currently sees instead of resetting it.
    const { error } = await supabase.rpc("set_my_preferences", {
      p_locale: locale ?? current.locale, p_theme: theme ?? current.theme,
    });
    if (error) logger.warn("preferences.save_failed", { code: error.code });
  }
  revalidatePath("/", "layout");
}
