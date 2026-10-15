"use client";

import { useTransition } from "react";
import type { Locale, ThemeMode } from "@workspace/i18n";
import { LanguageSelect } from "@workspace/ui/components/language-select";
import { ThemeSelect } from "@workspace/ui/components/theme-select";
import { setPreferencesAction } from "@/features/preferences/actions";

type Props = {
  locale: Locale;
  theme: ThemeMode;
  labels: { language: string; theme: string; themeSystem: string; themeLight: string; themeDark: string };
};

export function HeaderControls({ locale, theme, labels }: Props) {
  const [, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <LanguageSelect value={locale} label={labels.language} onChange={(v) => { start(() => setPreferencesAction({ locale: v })); }} />
      <ThemeSelect
        value={theme}
        onChange={(v) => { start(() => setPreferencesAction({ theme: v })); }}
        labels={{ label: labels.theme, system: labels.themeSystem, light: labels.themeLight, dark: labels.themeDark }}
      />
    </div>
  );
}
