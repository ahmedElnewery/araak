import Link from "next/link";
import { offerableSwitches } from "@workspace/authorization";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { settingsCrumb } from "@/lib/breadcrumbs";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { RoleForm } from "../role-form";

export default async function NewRolePage() {
  const ctx = await requirePermission("roles.create");
  const { t } = await getI18n();
  const r = t.portal.roles;
  return (
    <PageContainer labelledBy="new-role-title" width="narrow">
      <PageHeader
        titleId="new-role-title" title={r.newTitle} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [settingsCrumb(ctx.permissions, t), { label: r.title, href: "/settings/roles" }, { label: r.newTitle }] }}
      />
      <RoleForm roleId={null} name="" description="" offered={offerableSwitches(ctx.permissions)} on={[]} readOnly={false} extra={false} t={t} />
    </PageContainer>
  );
}
