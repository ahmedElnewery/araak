import type { ReactNode } from "react";
import { buttonVariants } from "@workspace/ui/components/button";
import type { LinkComponent } from "@workspace/ui/lib/link";
import { cn } from "@workspace/ui/lib/utils";

type Props = {
  page: number;
  pages: number;
  /** The URL of a page, keeping the current filters and sort. */
  href: (page: number) => string;
  link: LinkComponent;
  labels: { pagination: string; previous: string; next: string; pageOf: string };
  /** "Showing 1-25 of 124" or a total, on the opposite side. */
  summary?: ReactNode;
  className?: string;
};

/** The page numbers to show: the first, the last, and the current one with its neighbours; gaps become an ellipsis. */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev === 2) out.push(prev + 1); // a single hidden page is shown instead of an ellipsis
    else if (p - prev > 2) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

const pageOf = (label: string, page: number, pages: number) => label.replace("{page}", String(page)).replace("{pages}", String(pages));

/**
 * Previous, numbered pages and next; on phones previous, "page n of m" and next, so the bar never wraps. Plain GET
 * links, so every page is rendered and authorized by the server.
 */
export function PaginationBar({ page, pages, href, link: Link, labels, summary, className }: Props) {
  const step = (enabled: boolean, target: number, text: string) =>
    enabled ? (
      <Link href={href(target)} className={buttonVariants({ variant: "outline", size: "sm" })}>{text}</Link>
    ) : (
      <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>{text}</span>
    );
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      {summary ? <p className="text-xs text-subtle">{summary}</p> : <span />}
      {pages > 1 ? (
        <nav aria-label={labels.pagination} className="max-sm:w-full">
          <ul className="flex items-center gap-1 max-sm:justify-between">
            <li>{step(page > 1, page - 1, labels.previous)}</li>
            <li className="text-xs text-muted-foreground tabular-nums sm:hidden">{pageOf(labels.pageOf, page, pages)}</li>
            {pageWindow(page, pages).map((p, i) =>
              p === "gap" ? (
                <li key={`gap-${String(i)}`} aria-hidden="true" className="px-1 text-subtle max-sm:hidden">…</li>
              ) : (
                <li key={p} className="max-sm:hidden">
                  <Link
                    href={href(p)}
                    aria-current={p === page ? "page" : undefined}
                    aria-label={pageOf(labels.pageOf, p, pages)}
                    className={cn(
                      buttonVariants({ variant: p === page ? "default" : "ghost", size: "sm" }),
                      "min-w-8 px-2 tabular-nums",
                    )}
                  >
                    {p}
                  </Link>
                </li>
              ),
            )}
            <li>{step(page < pages, page + 1, labels.next)}</li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
