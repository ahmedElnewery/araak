import Link from "next/link";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { CreateTenantForm } from "./create-tenant-form";

export default async function NewTenantPage() {
  await requirePlatformAdmin("tenants.manage");
  const { t } = await getI18n();
  const tn = t.admin.tenants;
  return (
    <PageContainer labelledBy="new-tenant-title" width="narrow">
      <PageHeader
        titleId="new-tenant-title" title={tn.newTitle} description={tn.newIntro} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [{ label: tn.title, href: "/tenants" }, { label: tn.newTitle }] }}
      />
      <CreateTenantForm t={t.admin} />
    </PageContainer>
  );
}
