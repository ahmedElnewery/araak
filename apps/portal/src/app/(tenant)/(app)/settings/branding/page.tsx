import Link from "next/link";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { settingsCrumb } from "@/lib/breadcrumbs";
import { tenantLogoSrc } from "@/lib/branding";
import { loadPermissions, requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { requireTenant } from "@/lib/tenant-context";
import { BrandingForm } from "./branding-form";

// Manager only; a staff member or delegate is redirected to /forbidden by the guard (FR-036).
export default async function BrandingPage() {
  const ctx = await requireManager();
  const tenant = await requireTenant();
  const { t } = await getI18n();
  const b = t.portal.branding;
  return (
    <PageContainer labelledBy="branding-title" width="narrow">
      <PageHeader
        titleId="branding-title" title={b.title} description={b.intro} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [settingsCrumb(await loadPermissions(ctx), t), { label: b.title }] }}
      />
      <BrandingForm displayName={tenant.displayName} logoSrc={tenantLogoSrc(tenant)} t={t} />
    </PageContainer>
  );
}
