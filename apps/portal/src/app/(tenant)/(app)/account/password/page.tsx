import Link from "next/link";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { accountCrumb } from "@/lib/breadcrumbs";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { PasswordForm } from "./password-form";

export default async function PasswordPage() {
  await requireStaff();
  const { t } = await getI18n();
  return (
    <PageContainer labelledBy="password-title" width="narrow">
      <PageHeader
        titleId="password-title" title={t.portal.nav.password} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [accountCrumb(t), { label: t.portal.nav.password }] }}
      />
      <PasswordForm t={t} />
    </PageContainer>
  );
}
