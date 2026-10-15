import { notFound } from "next/navigation";
import { z } from "zod";
import { formatDate } from "@workspace/i18n";
import { Badge } from "@workspace/ui/components/badge";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { getI18n } from "@/lib/locale";
import { TENANT_CAPABILITIES, requirePlatformAdminAny } from "@/lib/platform-guards";
import { BrandingPanel } from "./branding-panel";
import { ManagersPanel, type ManagersData } from "./managers-panel";
import { NameForm } from "./name-form";
import { StaffPanel, type StaffRow } from "./staff-panel";
import { StateControl } from "./state-control";

/** Open to every tenant capability; each panel appears only with its own capability (the RPCs re-check it). */
export default async function TenantPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { tenantId } = await params;
  if (!z.uuid().safeParse(tenantId).success) notFound();
  const ctx = await requirePlatformAdminAny(TENANT_CAPABILITIES);
  const { locale, t } = await getI18n();
  const { data } = await ctx.supabase.rpc("platform_get_tenant", { p_tenant_id: tenantId });
  const tenant = data as { id: string; display_name: string; subdomain: string; state: "active" | "suspended"; created_at: string; has_logo?: boolean; logo_version?: number } | null;
  if (!tenant) notFound();
  const query = await searchParams;
  const canManageTenant = ctx.capabilities.includes("tenants.manage");

  const [managers, staff] = await Promise.all([
    ctx.capabilities.includes("tenants.managers.manage")
      ? ctx.supabase.rpc("platform_get_tenant_managers", { p_tenant_id: tenantId }).then((r) => (r.data as ManagersData | null) ?? null)
      : null,
    ctx.capabilities.includes("tenants.staff.manage")
      ? ctx.supabase.rpc("platform_list_tenant_staff", { p_tenant_id: tenantId }).then((r) => (r.data as StaffRow[] | null) ?? [])
      : null,
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold" dir="auto">{tenant.display_name}</h1>
        <p className="text-sm text-muted-foreground">
          <LtrText>{tenant.subdomain}</LtrText> · {t.admin.common.created} {formatDate(tenant.created_at, locale)}
        </p>
        {canManageTenant ? null : (
          <p className="flex items-center gap-2 text-sm">
            {t.admin.common.state}:
            <Badge variant={tenant.state === "active" ? "default" : "secondary"}>
              {tenant.state === "active" ? t.admin.tenants.stateActive : t.admin.tenants.stateSuspended}
            </Badge>
          </p>
        )}
      </div>
      {query.invite === "failed" ? <p role="status" className="text-sm text-destructive">{t.admin.tenants.invitationNotDelivered}</p> : null}
      {canManageTenant ? (
        <>
          <section aria-labelledby="details" className="space-y-4">
            <h2 id="details" className="text-lg font-medium">{t.admin.tenants.detailsTitle}</h2>
            <NameForm tenantId={tenant.id} displayName={tenant.display_name} subdomain={tenant.subdomain} t={t.admin} />
            <StateControl tenantId={tenant.id} state={tenant.state} t={t.admin} />
          </section>
          <BrandingPanel tenantId={tenant.id} displayName={tenant.display_name} hasLogo={tenant.has_logo ?? false} logoVersion={tenant.logo_version ?? 0} t={t.admin} />
        </>
      ) : null}
      {managers ? <ManagersPanel tenantId={tenant.id} data={managers} t={t.admin} locale={locale} /> : null}
      {staff ? <StaffPanel tenantId={tenant.id} staff={staff} t={t.admin} /> : null}
    </div>
  );
}
