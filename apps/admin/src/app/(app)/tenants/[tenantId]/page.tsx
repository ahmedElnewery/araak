import { notFound } from "next/navigation";
import { z } from "zod";
import { formatDate } from "@workspace/i18n";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { BrandingPanel } from "./branding-panel";
import { ManagersPanel, type ManagersData } from "./managers-panel";
import { NameForm } from "./name-form";
import { StateControl } from "./state-control";

export default async function TenantPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { tenantId } = await params;
  if (!z.uuid().safeParse(tenantId).success) notFound();
  const ctx = await requirePlatformAdmin("tenants.manage");
  const { locale, t } = await getI18n();
  const { data } = await ctx.supabase.rpc("platform_get_tenant", { p_tenant_id: tenantId });
  const tenant = data as { id: string; display_name: string; subdomain: string; state: "active" | "suspended"; created_at: string; has_logo?: boolean; logo_version?: number } | null;
  if (!tenant) notFound();
  const query = await searchParams;

  let managers: ManagersData | null = null;
  if (ctx.capabilities.includes("tenants.managers.manage")) {
    const res = await ctx.supabase.rpc("platform_get_tenant_managers", { p_tenant_id: tenantId });
    managers = (res.data as ManagersData | null) ?? null;
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold" dir="auto">{tenant.display_name}</h1>
        <p className="text-sm text-muted-foreground">
          <LtrText>{tenant.subdomain}</LtrText> · {t.admin.common.created} {formatDate(tenant.created_at, locale)}
        </p>
      </div>
      {query.invite === "failed" ? <p role="status" className="text-sm text-destructive">{t.admin.tenants.invitationNotDelivered}</p> : null}
      <section aria-labelledby="details" className="space-y-4">
        <h2 id="details" className="text-lg font-medium">{t.admin.tenants.detailsTitle}</h2>
        <NameForm tenantId={tenant.id} displayName={tenant.display_name} subdomain={tenant.subdomain} t={t.admin} />
        <StateControl tenantId={tenant.id} state={tenant.state} t={t.admin} />
      </section>
      <BrandingPanel tenantId={tenant.id} displayName={tenant.display_name} hasLogo={tenant.has_logo ?? false} logoVersion={tenant.logo_version ?? 0} t={t.admin} />
      {managers ? <ManagersPanel tenantId={tenant.id} data={managers} t={t.admin} locale={locale} /> : null}
    </div>
  );
}
