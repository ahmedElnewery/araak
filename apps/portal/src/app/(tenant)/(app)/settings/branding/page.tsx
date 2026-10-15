import { requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { tenantLogoSrc } from "@/lib/branding";
import { requireTenant } from "@/lib/tenant-context";
import { BrandingForm } from "./branding-form";

// Manager only; a staff member or delegate is redirected to /forbidden by the guard (FR-036).
export default async function BrandingPage() {
  await requireManager();
  const tenant = await requireTenant();
  const { t } = await getI18n();
  return (
    <section className="space-y-6" aria-labelledby="branding-title">
      <div className="space-y-1">
        <h1 id="branding-title" className="text-xl font-semibold">{t.portal.branding.title}</h1>
        <p className="text-muted-foreground">{t.portal.branding.intro}</p>
      </div>
      <BrandingForm displayName={tenant.displayName} logoSrc={tenantLogoSrc(tenant)} t={t} />
    </section>
  );
}
