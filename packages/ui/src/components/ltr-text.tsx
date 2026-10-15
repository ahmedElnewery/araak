import type { ReactNode } from "react";

/** Keeps usernames, emails and identifiers left-to-right inside RTL text. */
export function LtrText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
