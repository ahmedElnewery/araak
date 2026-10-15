"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

export type ThemeMode = "system" | "light" | "dark";

const icons = { system: Monitor, light: Sun, dark: Moon } as const;

type Props = {
  value: ThemeMode;
  onChange: (value: ThemeMode) => void;
  labels: { label: string; system: string; light: string; dark: string };
};

/**
 * Controlled; persistence is the caller's job (FR-039). The trigger shows only the mode's icon unless its size
 * container (the AppShell header) is at least `@lg` wide.
 */
export function ThemeSelect({ value, onChange, labels }: Props) {
  const Icon = icons[value];
  return (
    <Select value={value} onValueChange={(v) => { onChange(v as ThemeMode); }}>
      <SelectTrigger aria-label={labels.label} className="@lg:w-36">
        <SelectValue>
          <Icon aria-hidden="true" className="@lg:hidden" />
          <span className="hidden @lg:inline">{labels[value]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">{labels.system}</SelectItem>
        <SelectItem value="light">{labels.light}</SelectItem>
        <SelectItem value="dark">{labels.dark}</SelectItem>
      </SelectContent>
    </Select>
  );
}
