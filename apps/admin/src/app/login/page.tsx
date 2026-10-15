import { getI18n } from "@/lib/locale";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold">{t.admin.auth.title}</h1>
        <LoginForm labels={t.admin.auth} />
      </div>
    </main>
  );
}
