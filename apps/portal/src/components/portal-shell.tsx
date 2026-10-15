"use client";

import { History, Home, KeyRound, Palette, Settings, ShieldAlert, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@workspace/ui/components/app-shell";
import { cn } from "@workspace/ui/lib/utils";
import type { NavIcon, NavItem } from "@/lib/navigation";

const icons: Record<NavIcon, typeof Home> = {
  home: Home, account: User, settings: Settings, staff: Users, roles: KeyRound, branding: Palette, audit: History, security: ShieldAlert,
};

type Props = {
  dir: "rtl" | "ltr";
  brand: ReactNode;
  nav: NavItem[];
  navLabel: string;
  settingsLabel: string;
  shellLabels: { skipToContent: string; openMenu: string; closeMenu: string };
  header: ReactNode;
  children: ReactNode;
};

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

function NavList({ items, pathname, label, secondary }: { items: NavItem[]; pathname: string; label: string; secondary?: boolean }) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = icons[item.icon];
          // a parent with children is active on any of its sections
          const active = item.children.length > 0 ? item.children.some((c) => isActive(pathname, c.href)) || isActive(pathname, item.href) : isActive(pathname, item.href);
          return (
            <li key={item.id}>
              <Link
                href={item.children[0]?.href ?? item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent font-medium text-accent-foreground",
                )}
              >
                {secondary ? null : <Icon className="size-4" aria-hidden="true" />}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Primary navigation plus the optional Settings secondary sidebar (Constitution X). Items arrive already permission-filtered. */
export function PortalShell({ dir, brand, nav, navLabel, settingsLabel, shellLabels, header, children }: Props) {
  const pathname = usePathname();
  const settings = nav.find((i) => i.id === "settings");
  const secondary = settings && settings.children.length > 0 && isActive(pathname, settings.href) || settings?.children.some((c) => isActive(pathname, c.href));
  return (
    <AppShell
      dir={dir}
      brand={brand}
      primaryNav={<NavList items={nav} pathname={pathname} label={navLabel} />}
      secondaryNav={secondary && settings ? <NavList items={settings.children} pathname={pathname} label={settingsLabel} secondary /> : undefined}
      header={header}
      labels={shellLabels}
      closeSignal={pathname}
    >
      {children}
    </AppShell>
  );
}

