"use client";

import { Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@workspace/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@workspace/ui/components/sheet";

type Props = {
  dir: "rtl" | "ltr";
  /** Tenant identity block at the top of the primary sidebar. */
  brand: ReactNode;
  /** Primary navigation (a `<nav>` element supplied by the caller). */
  primaryNav: ReactNode;
  /** Rendered only when a module has subsections (Constitution X). */
  secondaryNav?: ReactNode;
  /** Page title / breadcrumb and header controls. */
  header: ReactNode;
  children: ReactNode;
  labels: { skipToContent: string; openMenu: string; closeMenu: string };
  /** Changes on navigation (e.g. the pathname); closes the mobile drawer. */
  closeSignal?: string;
};

/**
 * Presentational shell: primary sidebar, optional secondary sidebar, header, off-canvas drawer on mobile.
 * Logical properties only, so RTL/LTR needs no separate styles. No Supabase or authorization code here.
 */
export function AppShell({ dir, brand, primaryNav, secondaryNav, header, children, labels, closeSignal }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [closeSignal]);
  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:start-2 focus:top-2"
      >
        {labels.skipToContent}
      </a>
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-e bg-sidebar p-4 md:flex">
        <div>{brand}</div>
        <div className="flex-1 overflow-y-auto">{primaryNav}</div>
      </aside>
      {secondaryNav ? <aside className="hidden w-56 shrink-0 border-e bg-secondary p-4 lg:block">{secondaryNav}</aside> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b bg-card px-4 py-3">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={labels.openMenu} onClick={() => { setOpen(true); }}>
            <Menu aria-hidden="true" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">{header}</div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={dir === "rtl" ? "right" : "left"} className="flex w-72 flex-col gap-4 bg-sidebar p-4" dir={dir}>
          <SheetTitle className="sr-only">{labels.openMenu}</SheetTitle>
          <SheetDescription className="sr-only">{labels.openMenu}</SheetDescription>
          <div>{brand}</div>
          <div className="flex-1 overflow-y-auto">
            {primaryNav}
          </div>
          {secondaryNav ? <div className="border-t pt-4">{secondaryNav}</div> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
