"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type Navigation = {
  /** Soft navigation to a list URL; the apps hand in their router so packages/ui stays free of any framework import. */
  navigate: (href: string) => void;
  /** A navigation started by `navigate` is still loading. */
  pending: boolean;
  /** The query string of the page now open, to compare a new filter against and to know when the URL changed. */
  search: string;
};

const FilterNavigationContext = createContext<Navigation | null>(null);

/**
 * Lets every FilterBar underneath apply its filters without reloading the page. Optional: without it a FilterBar is the
 * plain GET form it always was, which is also what runs before hydration.
 */
export function FilterNavigationProvider({ navigate, pending, search, children }: Navigation & { children: ReactNode }) {
  const value = useMemo(() => ({ navigate, pending, search }), [navigate, pending, search]);
  return <FilterNavigationContext.Provider value={value}>{children}</FilterNavigationContext.Provider>;
}

export const useFilterNavigation = () => useContext(FilterNavigationContext);
