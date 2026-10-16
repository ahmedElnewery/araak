"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

type Props = {
  label: string;
  /** The current choice in a word or two ("All", "2 selected"). */
  value?: string;
  /** Highlights the trigger while this filter narrows the list. */
  active?: boolean;
  /** A submit button at the bottom of the panel. */
  apply?: string;
  children: ReactNode;
};

/**
 * One filter of a FilterBar: a native disclosure, so its fields stay inside the GET form (a portal would move them out
 * and drop their values) and it works before hydration. Closes on Escape and on a click outside.
 */
export function FilterMenu({ label, value, active = false, apply, children }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const outside = (e: PointerEvent) => {
      if (el.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !el.open) return;
      el.open = false;
      el.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    el.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      el.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={ref} className="group relative">
      <summary
        className={cn(
          "flex h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border bg-card px-3 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-hover [&::-webkit-details-marker]:hidden",
          active ? "border-primary bg-accent text-accent-foreground hover:bg-accent" : "border-border",
        )}
      >
        <span>
          {label}
          {value ? <span className={cn("font-normal", active ? "text-accent-foreground" : "text-muted-foreground")}>: {value}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute start-0 top-full z-20 mt-1.5 w-64 max-w-[calc(100vw-2rem)] space-y-1 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
        {children}
        {apply ? (
          <div className="mt-1 border-t border-divider pt-2 dark:border-border">
            <Button type="submit" size="sm" className="w-full">{apply}</Button>
          </div>
        ) : null}
      </div>
    </details>
  );
}
