"use client";

import { useTheme } from "next-themes";
import { useTransition } from "react";
import { LanguageSelect } from "@workspace/ui/components/language-select";
import { ThemeSelect, type ThemeMode } from "@workspace/ui/components/theme-select";
import { setLocaleAction } from "@/features/locale/set-locale-action";

type Props = {
  locale: "ar" | "en";
  labels: { language: string; theme: string; themeSystem: string; themeLight: string; themeDark: string };
};

export function HeaderControls({ locale, labels }: Props) {
  const { theme = "system", setTheme } = useTheme();
  const [, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <LanguageSelect value={locale} label={labels.language} onChange={(v) => { start(() => setLocaleAction(v)); }} />
      <ThemeSelect
        value={theme as ThemeMode}
        onChange={setTheme}
        labels={{ label: labels.theme, system: labels.themeSystem, light: labels.themeLight, dark: labels.themeDark }}
      />
    </div>
  );
}
