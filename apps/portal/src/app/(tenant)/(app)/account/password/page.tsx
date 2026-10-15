import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { PasswordForm } from "./password-form";

export default async function PasswordPage() {
  await requireStaff();
  const { t } = await getI18n();
  return (
    <section className="space-y-6" aria-labelledby="password-title">
      <h1 id="password-title" className="text-xl font-semibold">{t.portal.password.title}</h1>
      <p className="text-sm text-muted-foreground">{t.portal.password.intro}</p>
      <PasswordForm t={t} />
    </section>
  );
}
