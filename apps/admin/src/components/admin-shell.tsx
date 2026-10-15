"use client";

import { Building2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@workspace/ui/components/app-shell";
import { cn } from "@workspace/ui/lib/utils";

type NavItem = { href: string; label: string; icon: "tenants" | "admins" };
const icons = { tenants: Building2, admins: ShieldCheck };

type Props = {
  dir: "rtl" | "ltr";
  nav: NavItem[];
  navLabel: string;
  brandLabel: string;
  shellLabels: { skipToContent: string; openMenu: string; closeMenu: string };
  header: ReactNode;
  children: ReactNode;
};

/** Platform navigation. Wording and assets stay inside apps/admin (Constitution IX). */
export function AdminShell({ dir, nav, navLabel, brandLabel, shellLabels, header, children }: Props) {
  const pathname = usePathname();
  const primaryNav = (
    <nav aria-label={navLabel}>
      <ul className="space-y-1">
        {nav.map((item) => {
          const Icon = icons[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent font-medium text-accent-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  return (
    <AppShell
      dir={dir}
      brand={<span className="text-sm font-semibold">{brandLabel}</span>}
      primaryNav={primaryNav}
      header={<div className="flex flex-1 items-center justify-end gap-2">{header}</div>}
      labels={shellLabels}
      closeSignal={pathname}
    >
      {children}
    </AppShell>
  );
}
