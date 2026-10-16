"use client";

import { formatDateTime, type Locale } from "@workspace/i18n";
import { useTimeZone } from "@workspace/ui/hooks/use-time-zone";

/** A timestamp in the viewer's own time zone (UTC during server rendering, then the browser's zone). */
export function DateTime({ value, locale }: { value: string; locale: Locale }) {
  const timeZone = useTimeZone();
  return <time dateTime={value}>{formatDateTime(value, locale, timeZone)}</time>;
}
