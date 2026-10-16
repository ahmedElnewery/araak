import type { ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

type Props = {
  /** Decorative icon element. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Usually the page's primary action, so an empty list says what to do next. */
  action?: ReactNode;
  className?: string;
};

/** What a list shows when it has nothing: never a bare line of text, and when there is one, the way to add the first item. */
export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center", className)}>
      {icon ? (
        <span aria-hidden="true" className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground [&_svg]:size-6">{icon}</span>
      ) : null}
      <p className="text-base font-extrabold">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
