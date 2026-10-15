"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

export type ThemeMode = "system" | "light" | "dark";

type Props = {
  value: ThemeMode;
  onChange: (value: ThemeMode) => void;
  labels: { label: string; system: string; light: string; dark: string };
};

/** Controlled; persistence is the caller's job (FR-039). */
export function ThemeSelect({ value, onChange, labels }: Props) {
  return (
    <Select value={value} onValueChange={(v) => { onChange(v as ThemeMode); }}>
      <SelectTrigger aria-label={labels.label} className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">{labels.system}</SelectItem>
        <SelectItem value="light">{labels.light}</SelectItem>
        <SelectItem value="dark">{labels.dark}</SelectItem>
      </SelectContent>
    </Select>
  );
}
