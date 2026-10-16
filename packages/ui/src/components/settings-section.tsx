import type { ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

/** Stacks SettingsSection blocks with a divider between them. */
export function SettingsSections({ children, className, "aria-busy": busy }: { children: ReactNode; className?: string; "aria-busy"?: boolean }) {
  return <div aria-busy={busy} className={cn("divide-y divide-border", className)}>{children}</div>;
}

type Props = {
  /** For aria-labelledby; must be unique on the page. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * One group of settings in two columns: what it is and why on one side, the fields on the other. Stacks on phones.
 * The section heading is an h2 (the page title is the h1).
 */
export function SettingsSection({ id, title, description, children, className }: Props) {
  return (
    <section aria-labelledby={id} className={cn("grid gap-4 py-7 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-12", className)}>
      <div>
        <h2 id={id} className="text-[15px] font-extrabold">{title}</h2>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
