import { formatDate, type Locale } from "@workspace/i18n";
import type { ReactNode } from "react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { metadataEntries } from "@/features/audit/present";

/** The date range of a log filter, inside its "Period" menu. Whole days in UTC, both ends inclusive (filters.ts). */
export function PeriodFields({ idPrefix, from, to, labels }: { idPrefix: string; from: string | null; to: string | null; labels: { from: string; to: string } }) {
  return (
    <div className="grid gap-3 p-1">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-from`}>{labels.from}</Label>
        <Input id={`${idPrefix}-from`} type="date" name="from" defaultValue={from ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-to`}>{labels.to}</Label>
        <Input id={`${idPrefix}-to`} type="date" name="to" defaultValue={to ?? ""} />
      </div>
    </div>
  );
}

/** What the "Period" menu shows while closed: the chosen range, an open end left as a dash. */
export function periodLabel(f: { from: string | null; to: string | null }, locale: Locale, all: string): string {
  if (!f.from && !f.to) return all;
  const day = (d: string | null) => (d ? formatDate(d, locale) : "…");
  return `${day(f.from)} – ${day(f.to)}`;
}

/** A definition list of the event's fixed fields followed by its (already sanitized) metadata. */
export function EventDetails({ fields, metadata, labels }: {
  fields: { term: string; value: ReactNode }[]; metadata: Record<string, unknown>;
  labels: { details: string; noDetails: string };
}) {
  const entries = metadataEntries(metadata);
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {fields.map((f) => (
          <div key={f.term} className="contents">
            <dt className="text-muted-foreground">{f.term}</dt>
            <dd className="min-w-0 break-words">{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <h3 className="font-medium">{labels.details}</h3>
        {entries.length === 0 ? <p className="text-muted-foreground">{labels.noDetails}</p> : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1" dir="ltr">
            {entries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-all font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** Raw codes and ids stay left-to-right inside RTL text. */
export function Code({ children }: { children: ReactNode }) {
  return <bdi dir="ltr" className="font-mono text-xs">{children}</bdi>;
}
