import type { ReactNode } from "react";
import { loadEffectivePermissions } from "@workspace/authorization";
import { Button } from "@workspace/ui/components/button";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { HeaderControls } from "@/components/header-controls";
import { PortalShell } from "@/components/portal-shell";
import { signOutAction } from "@/features/auth/sign-out-action";
import { tenantLogoSrc } from "@/lib/branding";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { buildNavigation } from "@/lib/navigation";
import { requireTenant } from "@/lib/tenant-context";

// The authenticated shell: tenant identity, permission-filtered navigation, language/theme controls, sign-out.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff({ touch: false }); // the page's own guard renews the session once authorized
  const tenant = await requireTenant();
  const { locale, theme, dir, t } = await getI18n();
  const perms = await loadEffectivePermissions(ctx);
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
          <LtrText className="text-sm text-muted-foreground">{ctx.username}</LtrText>
          <div className="flex items-center gap-2">
            <HeaderControls
              locale={locale}
              theme={theme}
              labels={{ language: t.common.language, theme: t.common.theme, themeSystem: t.common.themeSystem, themeLight: t.common.themeLight, themeDark: t.common.themeDark }}
            />
            <form action={signOutAction}>
              <Button type="submit" variant="outline">{t.portal.nav.signOut}</Button>
            </form>
          </div>
        </>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">{children}</div>
    </PortalShell>
  );
}
