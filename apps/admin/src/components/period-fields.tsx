import { formatDate, type Locale } from "@workspace/i18n";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

/** The date range of a log filter, inside its "Period" menu. Whole days in UTC, both ends inclusive. */
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
