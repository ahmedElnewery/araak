import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { StaffName } from "@workspace/ui/components/staff-name";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { initials } from "@workspace/ui/lib/initials";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@workspace/ui/lib/shell";
import { PortalShell } from "@/components/portal-shell";
import { signOutAction } from "@/features/auth/sign-out-action";
import { tenantLogoSrc } from "@/lib/branding";
import { loadPermissions, requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { buildAccountSection, buildNavigation } from "@/lib/navigation";
import { requireTenant } from "@/lib/tenant-context";

// The authenticated shell: tenant identity, permission-filtered navigation, the account menu (own pages, sign-out).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff({ touch: false }); // the page's own guard renews the session once authorized
  const tenant = await requireTenant();
  const { dir, t } = await getI18n();
  const perms = await loadPermissions(ctx);
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;
  return (
    <PortalShell
      dir={dir}
      brand={
        <Link href="/" className="flex rounded-lg">
          <TenantIdentity name={tenant.displayName} logoSrc={tenantLogoSrc(tenant)} />
        </Link>
      }
      groups={buildNavigation(perms, t.portal.nav)}
      accountItems={buildAccountSection(perms, t.portal.nav)}
      account={{
        name: <StaffName staff={ctx} />,
        detail: perms.isManager ? t.portal.staff.managerBadge : <LtrText>{ctx.username}</LtrText>,
        email: <LtrText>{ctx.email}</LtrText>,
        initials: initials(ctx.firstName, ctx.lastName, ctx.username),
      }}
      signOutAction={signOutAction}
      defaultCollapsed={collapsed}
      labels={{
        nav: t.portal.nav.menu, settingsMenu: t.portal.nav.settingsMenu, account: t.portal.nav.account,
        accountMenu: t.common.accountMenu, accountSections: t.portal.nav.accountMenu, signOut: t.portal.nav.signOut,
        skipToContent: t.common.skipToContent, openMenu: t.common.openMenu, closeMenu: t.common.closeMenu,
        collapseMenu: t.common.collapseMenu, expandMenu: t.common.expandMenu, backToMenu: t.common.backToMenu,
      }}
    >
      <div className="max-w-3xl space-y-6">{children}</div>
    </PortalShell>
  );
}
