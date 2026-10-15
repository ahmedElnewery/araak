import type { ReactNode } from "react";
import { HeaderControls } from "@/components/header-controls";
import { SignOutButton } from "@/components/sign-out-button";
import { AdminShell } from "@/components/admin-shell";
import { getI18n } from "@/lib/locale";
import { requirePlatformSession } from "@/lib/platform-guards";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePlatformSession();
  const { locale, dir, t } = await getI18n();
  // Navigation is filtered by capability; routes still enforce it server-side.
  const nav = [
    ...(ctx.capabilities.includes("tenants.manage") ? [{ href: "/tenants", label: t.admin.nav.tenants, icon: "tenants" as const }] : []),
    ...(ctx.capabilities.includes("platform_admins.invite") ? [{ href: "/admins", label: t.admin.nav.admins, icon: "admins" as const }] : []),
  ];
  return (
    <AdminShell
      dir={dir}
      nav={nav}
      navLabel={t.admin.nav.menu}
      shellLabels={{ skipToContent: t.common.skipToContent, openMenu: t.common.openMenu, closeMenu: t.common.closeMenu }}
      header={
        <>
          <HeaderControls
            locale={locale}
            labels={{ language: t.common.language, theme: t.common.theme, themeSystem: t.common.themeSystem, themeLight: t.common.themeLight, themeDark: t.common.themeDark }}
          />
          <SignOutButton label={t.admin.auth.signOut} />
        </>
      }
    >
      {children}
    </AdminShell>
  );
}
