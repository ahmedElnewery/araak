"use client";

import { ArrowLeft, ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@workspace/ui/components/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@workspace/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useMediaQuery } from "@workspace/ui/hooks/use-media-query";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@workspace/ui/lib/shell";
import { cn } from "@workspace/ui/lib/utils";

export type ShellNavItem = {
  id: string;
  href: string;
  label: string;
  /** Decorative icon element; the shell marks it aria-hidden. */
  icon?: ReactNode;
  /** This item is the current page, or (for an item with children) contains it. */
  active?: boolean;
  /** Subsections: the secondary sidebar on desktop, a drill-down panel in the mobile drawer. */
  children?: ShellNavItem[];
};
export type ShellNavGroup = { id: string; label?: string; items: ShellNavItem[] };
/** The secondary sidebar of the section the current page belongs to (Constitution X: only for modules with subsections). */
export type ShellSection = { eyebrow?: string; title: string; label: string; items: ShellNavItem[] };
export type ShellLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page" | "true";
  onClick?: () => void;
};

type Props = {
  dir: "rtl" | "ltr";
  /** Tenant identity at the start of the top bar (the caller makes it a link home). */
  brand: ReactNode;
  /** Account menu at the end of the top bar. */
  account: ReactNode;
  nav: ShellNavGroup[];
  navLabel: string;
  section?: ShellSection;
  /** The app's router link (next/link); the shell stays framework-free. */
  link: ComponentType<ShellLinkProps>;
  /** From the sidebar cookie, so the first paint already has the chosen width. */
  defaultCollapsed?: boolean;
  labels: { skipToContent: string; openMenu: string; closeMenu: string; collapseMenu: string; expandMenu: string; backToMenu: string };
  /** Changes on navigation (e.g. the pathname); closes the mobile drawer. */
  closeSignal?: string;
  children: ReactNode;
};

const ICON = "flex size-5 shrink-0 items-center justify-center [&_svg]:size-[1.125rem]";
const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-start text-sm font-semibold text-muted-foreground transition-colors hover:bg-hover hover:text-foreground";
const ITEM_ACTIVE = "bg-accent font-bold text-accent-foreground hover:bg-accent hover:text-accent-foreground";
// Rail = icons only: below `lg` always, from `lg` when the person collapsed the sidebar (data-collapsed on the aside).
const RAIL_ITEM = "justify-center px-0 lg:justify-start lg:px-3 lg:group-data-[collapsed=true]/sidebar:justify-center lg:group-data-[collapsed=true]/sidebar:px-0";
const RAIL_LABEL = "sr-only lg:not-sr-only lg:group-data-[collapsed=true]/sidebar:sr-only";
const RAIL_HIDDEN = "hidden lg:block lg:group-data-[collapsed=true]/sidebar:hidden";

const current = (item: ShellNavItem) => (item.active ? (item.children?.length ? "true" : "page") : undefined);
const target = (item: ShellNavItem) => item.children?.[0]?.href ?? item.href;

function SectionList({ items, label, Link, onNavigate }: { items: ShellNavItem[]; label: string; Link: ComponentType<ShellLinkProps>; onNavigate?: () => void }) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.href} aria-current={item.active ? "page" : undefined} onClick={onNavigate} className={cn(ITEM, item.active && ITEM_ACTIVE)}>
              {item.icon ? <span aria-hidden="true" className={ICON}>{item.icon}</span> : null}
              <span className="min-w-0 truncate">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SectionHeading({ section, className }: { section: ShellSection; className?: string }) {
  return (
    <div className={className}>
      {section.eyebrow ? <p className="text-xs font-bold text-subtle">{section.eyebrow}</p> : null}
      <h2 className="text-base font-extrabold">{section.title}</h2>
    </div>
  );
}

/**
 * Presentational shell: a full-width top bar (tenant identity, account menu), a primary sidebar that collapses to
 * icons, the optional secondary sidebar of the current section, and an off-canvas drawer on phones in which sections
 * open as a drill-down panel. Logical properties only, so RTL/LTR needs no separate styles. No Supabase or
 * authorization code here: items arrive already permission-filtered.
 */
export function AppShell({ dir, brand, account, nav, navLabel, section, link: Link, defaultCollapsed = false, labels, closeSignal, children }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [open, setOpen] = useState(false);
  const [drill, setDrill] = useState<{ section: ShellSection; from?: string } | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery("(min-width: 1024px)");
  const rail = !wide || collapsed;

  useEffect(() => {
    setOpen(false);
  }, [closeSignal]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? SIDEBAR_COLLAPSED : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };
  // The drawer opens on the current section when there is one; otherwise on the main menu.
  const openDrawer = (next: boolean) => {
    if (next) setDrill(section ? { section } : null);
    setOpen(next);
  };
  const enter = (item: ShellNavItem, group?: string) => {
    setDrill({ section: { eyebrow: group, title: item.label, label: item.label, items: item.children ?? [] }, from: item.id });
    requestAnimationFrame(() => backRef.current?.focus());
  };
  const leave = () => {
    const from = drill?.from;
    setDrill(null);
    requestAnimationFrame(() => {
      const opener = from ? drawerRef.current?.querySelector<HTMLElement>(`[data-drill="${from}"]`) : null;
      (opener ?? drawerRef.current?.querySelector<HTMLElement>("a, button"))?.focus();
    });
  };
  const closeDrawer = () => { setOpen(false); };

  return (
    <TooltipProvider delayDuration={200}>
      <Sheet open={open} onOpenChange={openDrawer}>
        <div className="flex min-h-svh flex-col bg-background text-foreground">
          <a
            href="#main-content"
            className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:start-2 focus:top-2"
          >
            {labels.skipToContent}
          </a>
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-divider bg-card px-3 md:px-4">
            {/* the drawer's Radix trigger, so closing it returns focus here */}
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={labels.openMenu}>
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <Button
              variant="ghost" size="icon" className="hidden text-muted-foreground lg:inline-flex"
              aria-label={collapsed ? labels.expandMenu : labels.collapseMenu} aria-expanded={!collapsed} aria-controls="primary-sidebar"
              onClick={toggleCollapsed}
            >
              {collapsed ? <PanelLeftOpen aria-hidden="true" className="rtl:-scale-x-100" /> : <PanelLeftClose aria-hidden="true" className="rtl:-scale-x-100" />}
            </Button>
            <div className="min-w-0">{brand}</div>
            <div className="ms-auto flex min-w-0 items-center gap-2">{account}</div>
          </header>

          <div className="flex flex-1">
            <div
              id="primary-sidebar"
              data-collapsed={collapsed}
              className="group/sidebar sticky top-16 hidden h-[calc(100svh-4rem)] w-[4.5rem] shrink-0 flex-col overflow-y-auto border-e border-divider bg-sidebar p-3 transition-[width] duration-200 md:flex lg:w-64 lg:data-[collapsed=true]:w-[4.5rem]"
            >
              <nav aria-label={navLabel} className="space-y-5">
                {nav.map((group, gi) => (
                  <div key={group.id}>
                    {group.label ? (
                      <h2 id={`nav-group-${group.id}`} className={cn("mb-1.5 px-3 text-xs font-bold text-subtle", RAIL_HIDDEN)}>{group.label}</h2>
                    ) : null}
                    {gi > 0 ? <div aria-hidden="true" className="mx-2 mb-3 border-t border-divider lg:hidden lg:group-data-[collapsed=true]/sidebar:block" /> : null}
                    <ul className="space-y-1" aria-labelledby={group.label ? `nav-group-${group.id}` : undefined}>
                      {group.items.map((item) => {
                        const link = (
                          <Link href={target(item)} aria-current={current(item)} className={cn(ITEM, RAIL_ITEM, item.active && ITEM_ACTIVE)}>
                            <span aria-hidden="true" className={ICON}>{item.icon}</span>
                            <span className={cn("min-w-0 flex-1 truncate", RAIL_LABEL)}>{item.label}</span>
                            {item.active && item.children?.length ? (
                              <ChevronRight aria-hidden="true" className={cn("size-4 shrink-0 rtl:-scale-x-100", RAIL_HIDDEN)} />
                            ) : null}
                          </Link>
                        );
                        // icons only: the label stays the accessible name, the tooltip shows it to sighted pointer and keyboard users
                        return (
                          <li key={item.id}>
                            {rail ? (
                              <Tooltip>
                                <TooltipTrigger asChild>{link}</TooltipTrigger>
                                <TooltipContent side={dir === "rtl" ? "left" : "right"}>{item.label}</TooltipContent>
                              </Tooltip>
                            ) : link}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>

            {section ? (
              <div className="sticky top-16 hidden h-[calc(100svh-4rem)] w-56 shrink-0 flex-col overflow-y-auto border-e border-divider bg-secondary md:flex">
                <SectionHeading section={section} className="border-b border-divider px-5 pb-4 pt-5" />
                <div className="p-3">
                  <SectionList items={section.items} label={section.label} Link={Link} />
                </div>
              </div>
            ) : null}

            <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
              {children}
            </main>
          </div>

          <SheetContent
            ref={drawerRef} side={dir === "rtl" ? "right" : "left"} showCloseButton={false} dir={dir}
            className={cn("w-[19rem] gap-0 p-0", drill ? "bg-secondary" : "bg-sidebar")}
          >
            <SheetTitle className="sr-only">{navLabel}</SheetTitle>
            <SheetDescription className="sr-only">{navLabel}</SheetDescription>
            {drill ? (
              <>
                <div className="border-b border-divider px-3 pb-4 pt-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Button ref={backRef} variant="outline" size="sm" onClick={leave}>
                      <ArrowLeft aria-hidden="true" className="rtl:-scale-x-100" />
                      {labels.backToMenu}
                    </Button>
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon" aria-label={labels.closeMenu}><X aria-hidden="true" /></Button>
                    </SheetClose>
                  </div>
                  <SectionHeading section={drill.section} className="px-2" />
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <SectionList items={drill.section.items} label={drill.section.label} Link={Link} onNavigate={closeDrawer} />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-divider px-3 py-2.5">
                  <div className="min-w-0 flex-1">{brand}</div>
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon" aria-label={labels.closeMenu}><X aria-hidden="true" /></Button>
                  </SheetClose>
                </div>
                <nav aria-label={navLabel} className="flex-1 space-y-5 overflow-y-auto p-3">
                  {nav.map((group) => (
                    <div key={group.id}>
                      {group.label ? <h2 id={`drawer-group-${group.id}`} className="mb-1.5 px-3 text-xs font-bold text-subtle">{group.label}</h2> : null}
                      <ul className="space-y-1" aria-labelledby={group.label ? `drawer-group-${group.id}` : undefined}>
                        {group.items.map((item) => (
                          <li key={item.id}>
                            {item.children?.length ? (
                              <button type="button" data-drill={item.id} aria-current={current(item)} onClick={() => { enter(item, group.label); }} className={cn(ITEM, item.active && ITEM_ACTIVE)}>
                                <span aria-hidden="true" className={ICON}>{item.icon}</span>
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                <ChevronRight aria-hidden="true" className="size-4 shrink-0 rtl:-scale-x-100" />
                              </button>
                            ) : (
                              <Link href={item.href} aria-current={current(item)} onClick={closeDrawer} className={cn(ITEM, item.active && ITEM_ACTIVE)}>
                                <span aria-hidden="true" className={ICON}>{item.icon}</span>
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
              </>
            )}
          </SheetContent>
        </div>
      </Sheet>
    </TooltipProvider>
  );
}
