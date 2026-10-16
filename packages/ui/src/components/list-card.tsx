import type { ReactNode } from "react";
import type { LinkComponent } from "@workspace/ui/lib/link";
import { cn } from "@workspace/ui/lib/utils";

/** A short list of things in one card (roles, an account's sign-in options), one row each. */
export function ListCard({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y divide-divider overflow-hidden rounded-xl dark:divide-border border border-border bg-card", className)}>
      {children}
    </ul>
  );
}

type ItemProps = {
  /** Decorative icon element. */
  icon?: ReactNode;
  title: ReactNode;
  /** Opens the item: the title becomes the link. */
  href?: string;
  link?: LinkComponent;
  /** One short line under the title. */
  meta?: ReactNode;
  /** Buttons at the end of the row. */
  actions?: ReactNode;
  className?: string;
  "data-testid"?: string;
};

export function ListCardItem({ icon, title, href, link: Link, meta, actions, className, "data-testid": testId }: ItemProps) {
  return (
    <li data-testid={testId} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4", className)}>
      {icon ? (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground [&_svg]:size-[1.125rem]">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="font-bold">
          {href && Link ? <Link href={href} className="rounded-sm hover:underline">{title}</Link> : title}
        </div>
        {meta ? <div className="text-xs text-subtle">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </li>
  );
}
