import { getI18n } from "@/lib/locale";
import { requirePlatformSession } from "@/lib/platform-guards";
import { AppearanceForm } from "./appearance-form";

export default async function AppearancePage() {
  await requirePlatformSession();
  const { locale, theme, t } = await getI18n();
  return (
    <section className="max-w-3xl space-y-6" aria-labelledby="appearance-title">
      <div className="space-y-1">
        <h1 id="appearance-title" className="text-xl font-semibold">{t.common.appearance}</h1>
        <p className="text-muted-foreground">{t.common.appearanceIntro}</p>
      </div>
      <AppearanceForm
        theme={theme}
        locale={locale}
        labels={{
          theme: t.common.theme, themeHint: t.common.themeHint, light: t.common.themeLight, dark: t.common.themeDark,
          system: t.common.themeSystem, language: t.common.language, languageHint: t.common.languageHint,
        }}
      />
      <p className="text-sm text-muted-foreground">{t.admin.nav.appearanceSaved}</p>
    </section>
  );
}
