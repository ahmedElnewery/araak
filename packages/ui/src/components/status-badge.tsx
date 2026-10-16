import type { ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

const TONES = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-muted-foreground",
  accent: "bg-accent text-accent-foreground",
} as const;
export type StatusTone = keyof typeof TONES;

/**
 * A state (active, pending, expired, disabled...). The tone is never the only signal: the text always names the state.
 * Text/background pairs are verified by scripts/check-contrast.mjs in both themes.
 */
export function StatusBadge({ tone = "neutral", dot = false, children, className }: { tone?: StatusTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", TONES[tone], className)}>
      {dot ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** A neutral label for a value from a set (a role, a category). Not interactive. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="auto" className={cn("inline-flex w-fit items-center rounded-lg border border-divider bg-secondary px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", className)}>
      {children}
    </span>
  );
}
