import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import type { LinkComponent } from "@workspace/ui/lib/link";
import { cn } from "@workspace/ui/lib/utils";

export type SortDirection = "asc" | "desc";

export type DataColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Plain-text name shown before the value on phones, where the header row is hidden. Omit for self-explaining cells. */
  label?: string;
  /** A sortable column links to the same list sorted by it; `direction` is set on the column the list is sorted by. */
  sort?: { href: string; direction?: SortDirection };
  align?: "start" | "end";
  /** The row's title on phones: first, larger, without a label. */
  primary?: boolean;
  /** Not shown on phones (a decorative chevron, a detail already in the title). */
  hideOnMobile?: boolean;
  /** Visually hidden header (an actions column still needs a name for screen readers). */
  srOnlyHeader?: boolean;
  className?: string;
};

type Props<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Names the table for screen readers. */
  caption: string;
  /** Shown instead of the table when there are no rows (an EmptyState). */
  empty?: ReactNode;
  link?: LinkComponent;
  /** The card's last row, under the table: a PaginationBar. */
  footer?: ReactNode;
  /** Extra attributes per row, e.g. a test id. */
  rowProps?: (row: T) => Record<`data-${string}`, string>;
  className?: string;
};

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/**
 * A list of records in a card. ARIA table roles on plain boxes, shown as a table (CSS table display) from `md`; on
 * phones every row becomes a small card (title first, then "label: value" lines). The roles stay whatever the CSS, so
 * screen readers keep the table on every screen. Sorting and paging are links to URLs the server renders, so they work
 * without JavaScript and every page is re-authorized.
 */
export function DataTable<T>({ columns, rows, rowKey, caption, empty, link: Link, footer, rowProps, className }: Props<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="md:overflow-x-auto">
        <div role="table" aria-label={caption} aria-rowcount={rows.length + 1} className="w-full text-sm md:table md:border-collapse">
          <div role="rowgroup" className="max-md:sr-only md:table-header-group md:bg-secondary">
            <div role="row" className="md:table-row">
              {columns.map((c) => (
                <div
                  key={c.id}
                  role="columnheader"
                  aria-sort={c.sort ? (c.sort.direction ? ARIA_SORT[c.sort.direction] : "none") : undefined}
                  className={cn(
                    "h-11 px-5 align-middle text-xs font-bold whitespace-nowrap text-muted-foreground md:table-cell",
                    c.align === "end" ? "text-end" : "text-start",
                    c.sort && Link && "px-3.5",
                  )}
                >
                  {c.sort && Link ? (
                    <Link
                      href={c.sort.href}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-hover hover:text-foreground",
                        c.sort.direction && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {c.header}
                      {c.sort.direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : null}
                      {c.sort.direction === "desc" ? <ArrowDown aria-hidden="true" className="size-3.5" /> : null}
                      {c.sort.direction ? null : <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-70" />}
                    </Link>
                  ) : (
                    <span className={c.srOnlyHeader ? "sr-only" : undefined}>{c.header}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div role="rowgroup" className="md:table-row-group">
            {rows.map((row) => (
              <div key={rowKey(row)} role="row" {...rowProps?.(row)} className="border-t border-divider first:border-t-0 dark:border-border max-md:px-4 max-md:py-3 md:table-row md:border-t-0">
                {columns.map((c) => (
                  <div
                    key={c.id}
                    role="cell"
                    data-label={c.primary ? undefined : c.label}
                    className={cn(
                      "md:table-cell md:border-t md:border-divider md:px-5 md:dark:border-border md:py-3.5 md:align-middle",
                      c.align === "end" ? "md:text-end" : "md:text-start",
                      "max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:py-1",
                      c.primary && "max-md:block max-md:pb-1.5",
                      c.label && !c.primary && "max-md:before:shrink-0 max-md:before:text-xs max-md:before:font-bold max-md:before:text-subtle max-md:before:content-[attr(data-label)]",
                      c.hideOnMobile && "max-md:hidden",
                      c.className,
                    )}
                  >
                    {/* one box per cell, so a phone's "label: value" line keeps the value's parts together */}
                    <div className="min-w-0">{c.cell(row)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {footer ? <div className="border-t border-divider px-4 py-3 dark:border-border md:px-5">{footer}</div> : null}
    </div>
  );
}
