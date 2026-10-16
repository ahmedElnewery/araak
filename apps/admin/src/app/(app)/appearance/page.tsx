import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { settingsCard } from "@workspace/ui/components/settings-section";
import { getI18n } from "@/lib/locale";
import { requirePlatformSession } from "@/lib/platform-guards";
import { AppearanceForm } from "./appearance-form";

export default async function AppearancePage() {
  await requirePlatformSession();
  const { locale, theme, t } = await getI18n();
  return (
    <PageContainer labelledBy="appearance-title" width="narrow">
      <PageHeader titleId="appearance-title" title={t.common.appearance} description={t.common.appearanceIntro} />
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
      <p className="text-sm text-muted-foreground">{t.admin.nav.appearanceSaved}</p>
    </PageContainer>
  );
}
