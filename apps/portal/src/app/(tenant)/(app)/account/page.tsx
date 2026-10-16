import Link from "next/link";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { accountCrumb } from "@/lib/breadcrumbs";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { NameForm } from "./name-form";
import { UsernameForm } from "./username-form";

export default async function AccountPage() {
  const ctx = await requireStaff();
  const { t } = await getI18n();
  const a = t.portal.account;
  return (
    <PageContainer labelledBy="account-title" width="narrow">
      <PageHeader
        titleId="account-title" title={t.portal.nav.profile} description={a.profileIntro} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [accountCrumb(t), { label: t.portal.nav.profile }] }}
      />
      {/* one form and one save button per section: changing the name never resubmits the username */}
      <SettingsSections className={settingsCard}>
        <NameForm firstName={ctx.firstName} lastName={ctx.lastName} t={t} />
        <UsernameForm current={ctx.username} t={t} />
        <SettingsSection id="email-title" title={a.email} description={a.emailImmutable}>
          <p className="font-semibold"><LtrText>{ctx.email}</LtrText></p>
        </SettingsSection>
      </SettingsSections>
    </PageContainer>
  );
}
