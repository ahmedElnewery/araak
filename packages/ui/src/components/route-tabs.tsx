import type { LinkComponent } from "@workspace/ui/lib/link";
import { cn } from "@workspace/ui/lib/utils";

export type RouteTab = { href: string; label: string; count?: number; active?: boolean };

/**
 * Tabs that are pages (each has its own URL): a labelled navigation with the current one marked aria-current, not the
 * ARIA tabs pattern, which is for panels inside one page.
 */
export function RouteTabs({ label, tabs, link: Link, className }: { label: string; tabs: RouteTab[]; link: LinkComponent; className?: string }) {
  return (
    <nav aria-label={label} className={cn("border-b border-border", className)}>
      <ul className="-mb-px flex gap-7 overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 border-b-2 px-0.5 text-sm whitespace-nowrap transition-colors",
                tab.active ? "border-primary font-bold text-accent-foreground" : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <span className="min-w-6 rounded-full bg-neutral-soft px-1.5 text-center text-xs font-bold text-muted-foreground">{tab.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
