import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@workspace/ui/lib/shell";
import { AdminShell } from "@/components/admin-shell";
import { signOutAction } from "@/features/auth/sign-out-action";
import { getI18n } from "@/lib/locale";
import { TENANT_CAPABILITIES, requirePlatformSession } from "@/lib/platform-guards";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePlatformSession({ touch: false }); // the page's own guard renews the session once authorized
  const { dir, t } = await getI18n();
  const { data } = await ctx.supabase.auth.getClaims();
  const email = typeof data?.claims.email === "string" ? data.claims.email : "";
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;
  // Navigation is filtered by capability; routes still enforce it server-side.
  const nav = [
    ...(TENANT_CAPABILITIES.some((c) => ctx.capabilities.includes(c)) ? [{ href: "/tenants", label: t.admin.nav.tenants, icon: "tenants" as const }] : []),
    ...(ctx.capabilities.includes("platform_admins.invite") ? [{ href: "/admins", label: t.admin.nav.admins, icon: "admins" as const }] : []),
    ...(ctx.capabilities.includes("platform_audit.view") ? [{ href: "/audit", label: t.admin.nav.audit, icon: "audit" as const }] : []),
  ];
  return (
    <AdminShell
      dir={dir}
      nav={nav}
      email={email}
      signOutAction={signOutAction}
      defaultCollapsed={collapsed}
      labels={{
        nav: t.admin.nav.menu, brand: t.admin.nav.brand, accountMenu: t.common.accountMenu, appearance: t.admin.nav.appearance,
        signOut: t.admin.auth.signOut, skipToContent: t.common.skipToContent, openMenu: t.common.openMenu, closeMenu: t.common.closeMenu,
        collapseMenu: t.common.collapseMenu, expandMenu: t.common.expandMenu, backToMenu: t.common.backToMenu,
      }}
    >
      {children}
    </AdminShell>
  );
}
