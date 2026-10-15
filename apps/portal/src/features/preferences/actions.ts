"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, getTenantStaffContext } from "@workspace/auth/server";
import {
  LOCALE_COOKIE, PREFERENCE_COOKIE_MAX_AGE, THEME_COOKIE, isLocale, isThemeMode, type Locale, type ThemeMode,
} from "@workspace/i18n";
import { requireTenant } from "@/lib/tenant-context";

/**
 * Persists language and/or theme. Cookies always (so the login page matches); signed-in staff also write the
 * server-side preference, which then follows them to other browsers (FR-039).
 */
export async function setPreferencesAction(input: { locale?: Locale; theme?: ThemeMode }): Promise<void> {
  const locale = isLocale(input.locale) ? input.locale : undefined;
  const theme = isThemeMode(input.theme) ? input.theme : undefined;
  if (!locale && !theme) return;
  const store = await cookies();
  const opts = { path: "/", sameSite: "lax", maxAge: PREFERENCE_COOKIE_MAX_AGE } as const;
  if (locale) store.set(LOCALE_COOKIE, locale, opts);
  if (theme) store.set(THEME_COOKIE, theme, opts);

  const tenant = await requireTenant();
  const supabase = await createSupabaseServerClient("portal");
  const ctx = await getTenantStaffContext(tenant, supabase).catch(() => null);
  if (ctx) {
    await supabase.rpc("set_my_preferences", { p_locale: locale as string, p_theme: theme as string });
  }
  revalidatePath("/", "layout");
}
