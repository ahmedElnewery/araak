import Link from "next/link";
import { can } from "@workspace/authorization";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { settingsCrumb } from "@/lib/breadcrumbs";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { InviteForm } from "./invite-form";

export default async function InviteStaffPage() {
  const ctx = await requirePermission("staff.invite");
  const { t } = await getI18n();
  // only roles this actor may grant (the database ceiling is authoritative); no scopes or permission keys are shown
  const { data } = await ctx.supabase.rpc("list_grantable_roles");
  const roles = (data ?? []) as { id: string; name: string }[];
  const s = t.portal.staff;
  return (
    <PageContainer labelledBy="invite-title" width="narrow">
      <PageHeader
        titleId="invite-title" title={s.inviteTitle} description={s.inviteIntro} link={Link}
        breadcrumb={{
          label: t.common.breadcrumb,
          items: [
            settingsCrumb(ctx.permissions, t),
            // the directory is only an ancestor for someone who can open it
            ...(can(ctx.permissions, "staff.view") ? [{ label: s.directoryTitle, href: "/settings/staff" }] : []),
            { label: s.inviteTitle },
          ],
        }}
      />
      <InviteForm roles={roles} t={t} />
    </PageContainer>
  );
}
