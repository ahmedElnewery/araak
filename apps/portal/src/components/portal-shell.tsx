"use client";

import {
  Contrast, HandCoins, HandHeart, Handshake, History, House, KeyRound, Lock, MonitorSmartphone, Palette, Settings, ShieldAlert,
  UserPlus, UserRound, Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "@workspace/ui/components/account-menu";
import { AppShell, type ShellNavItem, type ShellSection } from "@workspace/ui/components/app-shell";
import type { NavGroup, NavIcon, NavItem } from "@/lib/navigation";

const icons: Record<NavIcon, typeof House> = {
  home: House, beneficiaries: HandHeart, donors: HandCoins, volunteers: Handshake, settings: Settings, staff: Users, invite: UserPlus,
  roles: KeyRound, branding: Palette, audit: History, security: ShieldAlert,
  profile: UserRound, appearance: Contrast, password: Lock, sessions: MonitorSmartphone,
};

type Props = {
  dir: "rtl" | "ltr";
  brand: ReactNode;
  groups: NavGroup[];
  accountItems: NavItem[];
  account: { name: ReactNode; detail?: ReactNode; email: ReactNode; initials: string };
  signOutAction: () => Promise<void>;
  defaultCollapsed: boolean;
  labels: {
    nav: string; settingsMenu: string; account: string; accountMenu: string; accountSections: string; signOut: string;
    skipToContent: string; openMenu: string; closeMenu: string; collapseMenu: string; expandMenu: string; backToMenu: string;
  };
  children: ReactNode;
};

const matches = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/** Only the most specific match is current: /account/appearance marks Appearance, not Profile (/account) as well. */
function toShell(items: NavItem[], pathname: string): ShellNavItem[] {
  const current = items.filter((i) => matches(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return items.map((i) => {
    const Icon = icons[i.icon];
    const children = i.children.length ? toShell(i.children, pathname) : undefined;
    return {
      id: i.id, href: i.href, label: i.label, icon: <Icon />, children,
      active: children ? children.some((c) => c.active) || matches(pathname, i.href) : i.id === current?.id,
    };
  });
}

/** Primary navigation, the current section's secondary sidebar and the account menu. Items arrive already permission-filtered. */
export function PortalShell({ dir, brand, groups, accountItems, account, signOutAction, defaultCollapsed, labels, children }: Props) {
  const pathname = usePathname();
  const nav = groups.map((g) => ({ id: g.id, label: g.label, items: toShell(g.items, pathname) }));
  const parent = nav.flatMap((g) => g.items.map((item) => ({ item, group: g.label }))).find(({ item }) => item.active && item.children?.length);
  const section: ShellSection | undefined = parent
    ? { eyebrow: parent.group, title: parent.item.label, label: labels.settingsMenu, items: parent.item.children ?? [] }
    : matches(pathname, "/account")
      ? { title: labels.account, label: labels.accountSections, items: toShell(accountItems, pathname) }
      : undefined;
  return (
    <AppShell
      dir={dir}
      brand={brand}
      account={
        <AccountMenu
          dir={dir} {...account} label={labels.accountMenu} link={Link}
          items={[{ href: "/account", label: labels.account, icon: <UserRound /> }]}
          signOut={{ label: labels.signOut, action: signOutAction }}
        />
      }
      nav={nav}
      navLabel={labels.nav}
      section={section}
      link={Link}
      defaultCollapsed={defaultCollapsed}
      labels={labels}
      closeSignal={pathname}
    >
      {children}
    </AppShell>
  );
}
