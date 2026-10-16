import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatDate } from "@workspace/i18n";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { StatusBadge } from "@workspace/ui/components/status-badge";
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
  const tn = t.admin.tenants;

  const [managers, staff] = await Promise.all([
    ctx.capabilities.includes("tenants.managers.manage")
      ? ctx.supabase.rpc("platform_get_tenant_managers", { p_tenant_id: tenantId }).then((r) => (r.data as ManagersData | null) ?? null)
      : null,
    ctx.capabilities.includes("tenants.staff.manage")
      ? ctx.supabase.rpc("platform_list_tenant_staff", { p_tenant_id: tenantId }).then((r) => (r.data as StaffRow[] | null) ?? [])
      : null,
  ]);

  return (
    <PageContainer labelledBy="tenant-title" width="narrow">
      <PageHeader
        titleId="tenant-title" title={<span dir="auto">{tenant.display_name}</span>} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [{ label: tn.title, href: "/tenants" }, { label: tenant.display_name }] }}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <LtrText>{tenant.subdomain}</LtrText>
            <span aria-hidden="true">·</span>
            <span>{t.admin.common.created} {formatDate(tenant.created_at, locale)}</span>
            {canManageTenant ? null : (
              <StatusBadge tone={tenant.state === "active" ? "success" : "warning"} dot>
                {tenant.state === "active" ? tn.stateActive : tn.stateSuspended}
              </StatusBadge>
            )}
          </span>
        }
      />
      {query.invite === "failed" ? <p role="status" className="text-sm text-destructive">{tn.invitationNotDelivered}</p> : null}
      {canManageTenant || managers || staff ? (
        <div className={settingsCard}>
          <SettingsSections>
            {canManageTenant ? <NameForm tenantId={tenant.id} displayName={tenant.display_name} subdomain={tenant.subdomain} t={t.admin} /> : null}
            {canManageTenant ? <StateControl tenantId={tenant.id} state={tenant.state} t={t.admin} /> : null}
            {canManageTenant ? (
              <BrandingPanel tenantId={tenant.id} displayName={tenant.display_name} hasLogo={tenant.has_logo ?? false} logoVersion={tenant.logo_version ?? 0} t={t.admin} />
            ) : null}
            {managers ? <ManagersPanel tenantId={tenant.id} data={managers} t={t.admin} locale={locale} /> : null}
            {staff ? <StaffPanel tenantId={tenant.id} staff={staff} t={t.admin} /> : null}
          </SettingsSections>
        </div>
      ) : null}
    </PageContainer>
  );
}
