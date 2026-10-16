"use client";

import { Building2, Contrast, History, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "@workspace/ui/components/account-menu";
import { AppShell } from "@workspace/ui/components/app-shell";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { initials } from "@workspace/ui/lib/initials";

type NavItem = { href: string; label: string; icon: "tenants" | "admins" | "audit" };
const icons = { tenants: Building2, admins: ShieldCheck, audit: History };

type Props = {
  dir: "rtl" | "ltr";
  nav: NavItem[];
  email: string;
  signOutAction: () => Promise<void>;
  defaultCollapsed: boolean;
  labels: {
    nav: string; brand: string; accountMenu: string; appearance: string; signOut: string;
    skipToContent: string; openMenu: string; closeMenu: string; collapseMenu: string; expandMenu: string; backToMenu: string;
  };
  children: ReactNode;
};

/** Platform navigation. Wording and assets stay inside apps/admin (Constitution IX). */
export function AdminShell({ dir, nav, email, signOutAction, defaultCollapsed, labels, children }: Props) {
  const pathname = usePathname();
  const items = nav.map((item) => {
    const Icon = icons[item.icon];
    return { id: item.href, href: item.href, label: item.label, icon: <Icon />, active: pathname === item.href || pathname.startsWith(`${item.href}/`) };
  });
  return (
    <AppShell
      dir={dir}
      brand={
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <span className="truncate text-[15px] font-extrabold">{labels.brand}</span>
        </Link>
      }
      account={
        <AccountMenu
          dir={dir} name={<LtrText>{email}</LtrText>} initials={initials(null, null, email)} label={labels.accountMenu} link={Link}
          items={[{ href: "/appearance", label: labels.appearance, icon: <Contrast /> }]}
          signOut={{ label: labels.signOut, action: signOutAction }}
        />
      }
      nav={[{ id: "main", items }]}
      navLabel={labels.nav}
      link={Link}
      defaultCollapsed={defaultCollapsed}
      labels={labels}
      closeSignal={pathname}
    >
      {children}
    </AppShell>
  );
}
