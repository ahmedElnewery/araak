import Link from "next/link";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { settingsCard } from "@workspace/ui/components/settings-section";
import { accountCrumb } from "@/lib/breadcrumbs";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { AppearanceForm } from "./appearance-form";

export default async function AppearancePage() {
  await requireStaff();
  const { locale, theme, t } = await getI18n();
  return (
    <PageContainer labelledBy="appearance-title" width="narrow">
      <PageHeader
        titleId="appearance-title" title={t.common.appearance} description={t.common.appearanceIntro} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [accountCrumb(t), { label: t.common.appearance }] }}
      />
      <div className={settingsCard}>
        <AppearanceForm
          theme={theme}
          locale={locale}
          labels={{
            theme: t.common.theme, themeHint: t.common.themeHint, light: t.common.themeLight, dark: t.common.themeDark,
            system: t.common.themeSystem, language: t.common.language, languageHint: t.common.languageHint,
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t.portal.nav.appearanceSaved}</p>
    </PageContainer>
  );
}
