"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

type Props = {
  value: "ar" | "en";
  onChange: (value: "ar" | "en") => void;
  label: string;
};

/** Controlled; each language is always shown in its own script. */
export function LanguageSelect({ value, onChange, label }: Props) {
  return (
    <Select value={value} onValueChange={(v) => { onChange(v as "ar" | "en"); }}>
      <SelectTrigger aria-label={label} className="@lg:w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ar" lang="ar">
          العربية
        </SelectItem>
        <SelectItem value="en" lang="en">
          English
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
