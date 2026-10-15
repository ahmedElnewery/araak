import { StatusPage } from "@workspace/ui/components/status-page";
import { peekInvitation } from "@/features/platform-admins/accept-action";
import { getI18n } from "@/lib/locale";
import { AcceptForm } from "./accept-form";

// Public. An invalid, used or expired token shows a neutral message and no form.
export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getI18n();
  const peek = token ? await peekInvitation(token) : { valid: false, email: null };
  if (!token || !peek.valid) {
    return <StatusPage title={t.admin.admins.acceptTitle} body={t.admin.admins.invitationInvalid} />;
  }
  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold">{t.admin.admins.acceptTitle}</h1>
        <p className="text-muted-foreground">{t.admin.admins.acceptIntro}</p>
        <AcceptForm token={token} t={t.admin} />
      </div>
    </main>
  );
}
