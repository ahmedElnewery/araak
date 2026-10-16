import type { ComponentType, ReactNode } from "react";

/**
 * What the shared components pass to the app's router link. The apps hand in `next/link`; packages/ui itself stays
 * free of any framework import.
 */
export type LinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page" | "true";
  "aria-label"?: string;
  onClick?: () => void;
  /** next/link: false keeps the scroll position (e.g. opening a detail sheet over a list). */
  scroll?: boolean;
};
export type LinkComponent = ComponentType<LinkProps>;
