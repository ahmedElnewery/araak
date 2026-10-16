import { UserPlus } from "lucide-react";
import Link from "next/link";
import { can, type EffectivePermissions } from "@workspace/authorization";
import type { Dictionary } from "@workspace/i18n";
import { buttonVariants } from "@workspace/ui/components/button";
import { PageHeader } from "@workspace/ui/components/page-header";
import { RouteTabs } from "@workspace/ui/components/route-tabs";
import { settingsCrumb } from "@/lib/breadcrumbs";

export const STAFF_TITLE_ID = "staff-title";

type Props = {
  perms: EffectivePermissions;
  t: Dictionary;
  active: "staff" | "invitations";
  /** Omitted when the viewer cannot open that list. */
  counts: { staff?: number; invitations?: number };
};

/** Staff and its pending invitations are one place with two tabs; inviting is the primary action of both. */
export function StaffHeader({ perms, t, active, counts }: Props) {
  const s = t.portal.staff;
  const canView = can(perms, "staff.view");
  // the invite page is not in the navigation for anyone who sees this directory (lib/navigation.ts)
  const invite = can(perms, "staff.invite") ? (
    <Link href="/settings/staff/invite" className={buttonVariants({ className: "h-10 rounded-[10px]" })}>
      <UserPlus aria-hidden="true" />
      {t.portal.nav.inviteStaff}
    </Link>
  ) : null;
  const title = canView ? s.directoryTitle : s.pendingTitle;
  return (
    <>
      <PageHeader
        titleId={STAFF_TITLE_ID}
        title={title}
        breadcrumb={{ label: t.common.breadcrumb, items: [settingsCrumb(perms, t), { label: title }] }}
        actions={invite}
        link={Link}
      />
      {/* someone who may invite but not see the directory has only the invitations list: no tabs to switch */}
      {canView ? (
        <RouteTabs
          label={s.tabsLabel}
          link={Link}
          tabs={[
            { href: "/settings/staff", label: s.directoryTitle, count: counts.staff, active: active === "staff" },
            { href: "/settings/staff/invitations", label: s.pendingTitle, count: counts.invitations, active: active === "invitations" },
          ]}
        />
      ) : null}
    </>
  );
}
