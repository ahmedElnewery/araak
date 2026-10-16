"use client";

import { useState, useTransition } from "react";
import type { Locale, ThemeMode } from "@workspace/i18n";
import { AppearancePicker } from "@workspace/ui/components/appearance-picker";
import { setPreferencesAction } from "@/features/preferences/actions";

type Props = {
  theme: ThemeMode;
  locale: Locale;
  labels: { theme: string; themeHint: string; light: string; dark: string; system: string; language: string; languageHint: string };
};

/** Saves on every change: stored for the signed-in person, so it follows them to other browsers (FR-039). */
export function AppearanceForm({ theme, locale, labels }: Props) {
  const [value, setValue] = useState({ theme, locale });
  const [pending, start] = useTransition();
  return (
    <AppearancePicker
      theme={value.theme}
      locale={value.locale}
      pending={pending}
      labels={labels}
      onThemeChange={(v) => {
        setValue((s) => ({ ...s, theme: v }));
        start(() => setPreferencesAction({ theme: v }));
      }}
      onLocaleChange={(v) => {
        setValue((s) => ({ ...s, locale: v }));
        start(() => setPreferencesAction({ locale: v }));
      }}
    />
  );
}
