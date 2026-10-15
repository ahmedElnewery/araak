import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { getI18n } from "@/lib/locale";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <PublicShell title={t.portal.auth.title}>
      <LoginForm labels={t.portal.auth} />
      <p className="text-sm">
        <Link className="underline" href="/recover">{t.portal.auth.forgotPassword}</Link>
      </p>
    </PublicShell>
  );
}
