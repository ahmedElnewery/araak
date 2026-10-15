import Link from "next/link";
import type { ReactNode } from "react";
import { can, loadEffectivePermissions } from "@workspace/authorization";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { signOutAction } from "@/features/auth/sign-out-action";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { requireTenant } from "@/lib/tenant-context";

// Minimal signed-in frame for this story; the full accessible shell replaces it in the shell story.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff();
  const tenant = await requireTenant();
  const { t } = await getI18n();
  const perms = await loadEffectivePermissions(ctx);
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3">
        <TenantIdentity name={tenant.displayName} logoAlt={t.common.logoAlt} />
        <nav aria-label={t.portal.nav.menu} className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/">{t.portal.nav.home}</Link>
          {can(perms, "staff.view") ? <Link href="/settings/staff">{t.portal.nav.staff}</Link> : null}
          {can(perms, "roles.view") ? <Link href="/settings/roles">{t.portal.nav.roles}</Link> : null}
          {can(perms, "staff.invite") ? <Link href="/settings/staff/invite">{t.portal.nav.inviteStaff}</Link> : null}
          {can(perms, "staff.invite") || can(perms, "staff.view") ? <Link href="/settings/staff/invitations">{t.portal.nav.invitations}</Link> : null}
          <Link href="/account">{t.portal.nav.account}</Link>
          <LtrText className="text-muted-foreground">{ctx.username}</LtrText>
          <form action={signOutAction}>
            <button type="submit" className="underline">{t.portal.nav.signOut}</button>
          </form>
        </nav>
      </header>
      <main id="main-content" className="mx-auto max-w-3xl space-y-6 p-6">{children}</main>
    </div>
  );
}
