import Link from "next/link";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { InviteForm } from "./invite-form";

export default async function InviteAdminPage() {
  const ctx = await requirePlatformAdmin("platform_admins.invite");
  const { t } = await getI18n();
  const a = t.admin.admins;
  return (
    <PageContainer labelledBy="invite-admin-title" width="narrow">
      <PageHeader
        titleId="invite-admin-title" title={a.inviteTitle} description={a.intro} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [{ label: a.title, href: "/admins" }, { label: a.inviteTitle }] }}
      />
      {/* only the actor's own capabilities are offered (the database enforces the subset rule regardless) */}
      <InviteForm t={t.admin} capabilities={ctx.capabilities as (keyof typeof t.admin.capabilities)[]} />
    </PageContainer>
  );
}
