import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { getI18n } from "@/lib/locale";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; notice?: string }> }) {
  const { reason, notice } = await searchParams;
  const { t } = await getI18n();
  return (
    <PublicShell title={t.portal.auth.title}>
      {reason === "expired" ? <p role="status" className="text-sm">{t.portal.auth.sessionExpired}</p> : null}
      <LoginForm
        labels={t.portal.auth}
        passwordChangedMessage={notice === "password-changed" ? t.portal.recovery.done : undefined}
      />
      <p className="text-sm">
        <Link className="underline" href="/recover">{t.portal.auth.forgotPassword}</Link>
      </p>
    </PublicShell>
  );
}
