import type { ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Stacks SettingsSection blocks with a divider between them. The spacing is on the direct children, so a section may
 * be wrapped in its own form (one save button per section) and still line up.
 */
export function SettingsSections({ children, className, "aria-busy": busy }: { children: ReactNode; className?: string; "aria-busy"?: boolean }) {
  return (
    <div aria-busy={busy} className={cn("divide-y divide-border *:py-7 *:first:pt-0 *:last:pb-0", className)}>
      {children}
    </div>
  );
}

type Props = {
  /** The heading's id, for an aria-describedby or a link to the section; unique on the page. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * One group of settings in two columns: what it is and why on one side, the fields on the other. Stacks on phones.
 * The heading is an h2 (the page title is the h1). Not a named region: a settings page would otherwise be a stack of
 * landmarks, and the headings already let a screen reader jump between groups.
 */
export function SettingsSection({ id, title, description, children, className }: Props) {
  return (
    <section className={cn("grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-12", className)}>
      <div>
        <h2 id={id} className="text-[15px] font-extrabold">{title}</h2>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

/** The card settings sections sit in; a form can carry these classes itself. */
export const settingsCard = "rounded-xl border border-border bg-card p-5 md:p-7";

/** The bottom row of a settings card, under a divider: the save button at the end, its result message before it. */
export function SettingsFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5", className)}>{children}</div>;
}
