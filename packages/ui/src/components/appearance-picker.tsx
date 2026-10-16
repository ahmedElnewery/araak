"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

export type ThemeMode = "system" | "light" | "dark";
export type LocaleCode = "ar" | "en";

type Props = {
  theme: ThemeMode;
  locale: LocaleCode;
  onThemeChange: (value: ThemeMode) => void;
  onLocaleChange: (value: LocaleCode) => void;
  /** True while a change is being saved. */
  pending?: boolean;
  labels: { theme: string; themeHint: string; light: string; dark: string; system: string; language: string; languageHint: string };
};

// Fixed previews of the two palettes (packages/ui/src/styles/globals.css): a preview must show the other theme too,
// so it cannot use the current theme's tokens.
const PALETTES = {
  light: { bg: "bg-[#f1f6f7]", card: "bg-[#ffffff]", accent: "bg-[#087e89]", line: "bg-[#d5e3e7]" },
  dark: { bg: "bg-[#212121]", card: "bg-[#2f2f2f]", accent: "bg-[#68b78b]", line: "bg-[#4a4a4a]" },
} as const;

function Half({ palette }: { palette: keyof typeof PALETTES }) {
  const p = PALETTES[palette];
  return (
    <span className={cn("flex flex-1 flex-col gap-1.5 p-2", p.bg)}>
      <span className={cn("h-1.5 w-1/2 rounded-full", p.accent)} />
      <span className={cn("flex flex-1 flex-col gap-1.5 rounded-md p-1.5", p.card)}>
        <span className={cn("h-1 w-4/5 rounded-full", p.line)} />
        <span className={cn("h-1 w-3/5 rounded-full", p.line)} />
      </span>
    </span>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 py-7 first:pt-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-12">
      <div>
        <h2 id={id} className="text-[15px] font-extrabold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

// The native input covers its whole card (transparent), so a click or tap anywhere on the card hits the radio itself.
const INPUT = "absolute inset-0 size-full cursor-pointer appearance-none rounded-xl opacity-0";
const CARD =
  "relative cursor-pointer rounded-xl border-2 border-border bg-card transition-colors hover:border-input has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid";

/** Theme and language as native radio groups with previews. Controlled; persistence is the caller's job (FR-039). */
export function AppearancePicker({ theme, locale, onThemeChange, onLocaleChange, pending, labels }: Props) {
  const id = useId();
  const themes = [
    { value: "light", label: labels.light, Icon: Sun, halves: ["light", "light"] },
    { value: "dark", label: labels.dark, Icon: Moon, halves: ["dark", "dark"] },
    { value: "system", label: labels.system, Icon: Monitor, halves: ["light", "dark"] },
  ] as const;
  // each language is always shown in its own script
  const languages = [
    { value: "ar", label: "العربية" },
    { value: "en", label: "English" },
  ] as const;
  return (
    <div className="divide-y divide-border" aria-busy={pending || undefined}>
      <Section id={`${id}-theme`} title={labels.theme} hint={labels.themeHint}>
        <div role="radiogroup" aria-labelledby={`${id}-theme`} className="grid grid-cols-3 gap-3">
          {themes.map(({ value, label, Icon, halves }) => (
            <label key={value} className={cn(CARD, "flex flex-col gap-2 p-2")}>
              <input type="radio" name={`${id}-theme`} value={value} checked={theme === value} onChange={() => { onThemeChange(value); }} className={INPUT} />
              <span aria-hidden="true" className="flex h-16 overflow-hidden rounded-lg border border-divider">
                <Half palette={halves[0]} />
                <Half palette={halves[1]} />
              </span>
              <span className="flex items-center gap-2 px-1 pb-0.5 text-sm font-bold">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </span>
            </label>
          ))}
        </div>
      </Section>
      <Section id={`${id}-language`} title={labels.language} hint={labels.languageHint}>
        <div role="radiogroup" aria-labelledby={`${id}-language`} className="flex flex-col gap-2">
          {languages.map(({ value, label }) => (
            <label key={value} className={cn(CARD, "group flex min-h-13 items-center gap-3 px-4")}>
              <input type="radio" name={`${id}-language`} value={value} checked={locale === value} onChange={() => { onLocaleChange(value); }} className={INPUT} />
              <span aria-hidden="true" className="size-[1.125rem] shrink-0 rounded-full border-2 border-input group-has-[:checked]:border-[5px] group-has-[:checked]:border-primary" />
              <span lang={value} className="text-sm font-bold">{label}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
