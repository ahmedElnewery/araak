import Link from "next/link";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { NameForm } from "./name-form";
import { UsernameForm } from "./username-form";

export default async function AccountPage() {
  const ctx = await requireStaff();
  const { t } = await getI18n();
  return (
    <section className="space-y-6" aria-labelledby="account-title">
      <h1 id="account-title" className="text-xl font-semibold">{t.portal.account.title}</h1>
      <NameForm firstName={ctx.firstName} lastName={ctx.lastName} t={t} />
      <UsernameForm current={ctx.username} t={t} />
      <nav aria-label={t.portal.account.title} className="flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/account/sessions">{t.portal.account.sessionsLink}</Link>
        <Link className="underline" href="/account/password">{t.portal.account.passwordLink}</Link>
      </nav>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t.portal.account.email}</p>
        <p><LtrText>{ctx.email}</LtrText></p>
        <p className="text-sm text-muted-foreground">{t.portal.account.emailImmutable}</p>
      </div>
    </section>
  );
}
