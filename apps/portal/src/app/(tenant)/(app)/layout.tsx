import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@workspace/ui/components/button";
import { StaffName } from "@workspace/ui/components/staff-name";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { HeaderControls } from "@/components/header-controls";
import { PortalShell } from "@/components/portal-shell";
import { signOutAction } from "@/features/auth/sign-out-action";
import { tenantLogoSrc } from "@/lib/branding";
import { loadPermissions, requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { buildNavigation } from "@/lib/navigation";
import { requireTenant } from "@/lib/tenant-context";

// The authenticated shell: tenant identity, permission-filtered navigation, language/theme controls, sign-out.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff({ touch: false }); // the page's own guard renews the session once authorized
  const tenant = await requireTenant();
  const { locale, theme, dir, t } = await getI18n();
  const perms = await loadPermissions(ctx);
  return (
    <PortalShell
      dir={dir}
      brand={<TenantIdentity name={tenant.displayName} logoSrc={tenantLogoSrc(tenant)} />}
      nav={buildNavigation(perms, t.portal.nav)}
      navLabel={t.portal.nav.menu}
      settingsLabel={t.portal.nav.settingsMenu}
      shellLabels={{ skipToContent: t.common.skipToContent, openMenu: t.common.openMenu, closeMenu: t.common.closeMenu }}
      header={
        <>
          {/* A narrow header (phones, or tablets with both sidebars) gets the design reference's compact form: no name, icon-only theme and sign-out */}
          <StaffName staff={ctx} className="hidden min-w-0 truncate text-sm text-muted-foreground @lg:block" />
          <div className="ms-auto flex items-center gap-2">
            <HeaderControls
              locale={locale}
              theme={theme}
              labels={{ language: t.common.language, theme: t.common.theme, themeSystem: t.common.themeSystem, themeLight: t.common.themeLight, themeDark: t.common.themeDark }}
            />
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="@max-lg:px-2.5">
                <span aria-hidden="true" className="@lg:hidden">
                  <LogOut className="size-4 rtl:-scale-x-100" />
                </span>
                <span className="@max-lg:sr-only">{t.portal.nav.signOut}</span>
              </Button>
            </form>
          </div>
        </>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">{children}</div>
    </PortalShell>
  );
}
