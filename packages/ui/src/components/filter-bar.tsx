import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import type { LinkComponent } from "@workspace/ui/lib/link";
import { cn } from "@workspace/ui/lib/utils";

export { FilterMenu } from "@workspace/ui/components/filter-menu";

type BarProps = {
  /** The list's own URL: filters are query parameters, so a filtered list can be bookmarked and shared. */
  action: string;
  label: string;
  submitLabel: string;
  /** "Clear", shown only while something is filtered. */
  clear?: { href: string; label: string };
  link?: LinkComponent;
  /** Parameters to keep across a new search (sort, a person filter). Empty values are left out. */
  keep?: Record<string, string | null | undefined>;
  children: ReactNode;
  className?: string;
};

/**
 * Search and filters for one list, in a single row that wraps on small screens. A plain GET form: the server reads the
 * query, applies the filters and renders the page, so nothing depends on client state or JavaScript.
 */
export function FilterBar({ action, label, submitLabel, clear, link: Link, keep = {}, children, className }: BarProps) {
  return (
    <form action={action} method="get" role="search" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      {Object.entries(keep).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
      {children}
      <Button type="submit" className="h-10 rounded-[10px] px-4">{submitLabel}</Button>
      {clear && Link ? (
        <Link href={clear.href} className={cn(buttonVariants({ variant: "ghost" }), "h-10 rounded-[10px]")}>{clear.label}</Link>
      ) : null}
    </form>
  );
}

type SearchProps = {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  placeholder?: string;
  maxLength?: number;
  /** Id of a visible hint describing what is searched. */
  describedBy?: string;
};

/** The search field of a FilterBar. Its label is visually hidden: the magnifier and the placeholder say what it is. */
export function FilterSearch({ id, name, label, defaultValue, placeholder, maxLength, describedBy }: SearchProps) {
  return (
    <div className="relative min-w-56 flex-1 sm:max-w-sm">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <Input
        id={id} type="search" name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} maxLength={maxLength}
        aria-describedby={describedBy} className="h-10 rounded-[10px] bg-card ps-9 dark:bg-card"
      />
    </div>
  );
}

type OptionProps = {
  type?: "checkbox" | "radio";
  name: string;
  value: string;
  label: ReactNode;
  defaultChecked?: boolean;
  /** How many records have this value, when the server knows it. */
  count?: number;
};

/** A choice inside a FilterMenu. */
export function FilterOption({ type = "checkbox", name, value, label, defaultChecked, count }: OptionProps) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-hover">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="size-4 shrink-0 accent-primary" />
      <span className="flex-1">{label}</span>
      {count === undefined ? null : <span className="text-xs text-subtle tabular-nums">{count}</span>}
    </label>
  );
}
