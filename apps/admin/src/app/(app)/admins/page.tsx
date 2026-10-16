import { UserPlus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@workspace/ui/components/button";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";

// No list, remove, demote or disable control exists for platform admins: removal is operations-only (CL-041).
export default async function AdminsPage() {
  await requirePlatformAdmin("platform_admins.invite");
  const { t } = await getI18n();
  const a = t.admin.admins;
  return (
    <PageContainer labelledBy="admins-title" width="narrow">
      <PageHeader
        titleId="admins-title" title={a.title} description={a.intro}
        actions={
          <Link href="/admins/invite" className={buttonVariants({ className: "h-10 rounded-[10px]" })}>
            <UserPlus aria-hidden="true" />
            {a.invite}
          </Link>
        }
      />
      <p className="text-sm text-muted-foreground">{a.noRemoval}</p>
    </PageContainer>
  );
}
