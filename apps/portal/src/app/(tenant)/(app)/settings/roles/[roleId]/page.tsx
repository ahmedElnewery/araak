import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { can, grantsToSwitches, offerableSwitches } from "@workspace/authorization";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { settingsCrumb } from "@/lib/breadcrumbs";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import type { RoleRow } from "../page";
import { RoleForm } from "../role-form";

export default async function EditRolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const ctx = await requirePermission("roles.view");
  const { roleId } = await params;
  if (!z.uuid().safeParse(roleId).success) notFound();
  const { t } = await getI18n();
  const { data } = await ctx.supabase.rpc("list_roles");
  const role = ((data ?? []) as RoleRow[]).find((r) => r.id === roleId);
  if (!role) notFound();
  const { on, extra } = grantsToSwitches(role.grants);
  // read-only when the actor holds the role (CL-027) or lacks roles.update; the database denies a forged save either way
  const readOnly = role.heldByActor || !can(ctx.permissions, "roles.update");
  const r = t.portal.roles;
  return (
    <PageContainer labelledBy="edit-role-title" width="narrow">
      <PageHeader
        titleId="edit-role-title" title={<bdi dir="auto">{role.name}</bdi>} description={role.description ?? undefined} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [settingsCrumb(ctx.permissions, t), { label: r.title, href: "/settings/roles" }, { label: role.name }] }}
      />
      <RoleForm
        roleId={role.id} name={role.name} description={role.description ?? ""} offered={offerableSwitches(ctx.permissions)}
        on={on} readOnly={readOnly} extra={extra} t={t}
      />
    </PageContainer>
  );
}
