import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { LinkComponent } from "@workspace/ui/lib/link";
import { cn } from "@workspace/ui/lib/utils";

export type Crumb = { label: string; href?: string };

type Props = {
  title: ReactNode;
  /** For the page section's aria-labelledby. */
  titleId: string;
  description?: ReactNode;
  /** Ancestors then the current page (the last item, without href). */
  breadcrumb?: { label: string; items: Crumb[] };
  /** The page's own actions: at most one primary button, at the end of the title row. */
  actions?: ReactNode;
  link?: LinkComponent;
  className?: string;
};

/** The first thing in every page: breadcrumb, the page's one h1, a short description and its actions. */
export function PageHeader({ title, titleId, description, breadcrumb, actions, link: Link, className }: Props) {
  const crumbs = breadcrumb?.items ?? [];
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 space-y-1">
        {crumbs.length > 1 && breadcrumb ? (
          <nav aria-label={breadcrumb.label}>
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={`${c.label}-${String(i)}`} className="flex items-center gap-1.5">
                    {i > 0 ? <ChevronRight aria-hidden="true" className="size-3 rtl:-scale-x-100" /> : null}
                    {c.href && !last && Link ? (
                      <Link href={c.href} className="rounded-sm text-muted-foreground hover:text-foreground hover:underline">{c.label}</Link>
                    ) : (
                      <span aria-current={last ? "page" : undefined}>{c.label}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}
        <h1 id={titleId} className="text-[1.375rem] leading-snug font-extrabold text-balance">{title}</h1>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The page's root: a section named by its PageHeader, wide for lists and tables, narrow for forms and settings.
 * Aligned to the start of the workspace, not centred, so it lines up with the sidebars at every width.
 */
export function PageContainer({ width = "wide", labelledBy, children, className }: { width?: "wide" | "narrow"; labelledBy: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={cn("space-y-6", width === "wide" ? "max-w-[77.5rem]" : "max-w-[60rem]", className)}>
      {children}
    </section>
  );
}
