import { PublicShell } from "@/components/public-shell";
import { peekInvitation } from "@/features/invitations/accept-action";
import { getI18n } from "@/lib/locale";
import { AcceptForm } from "./accept-form";

// Public. An invalid, used, expired or foreign-tenant token shows one neutral message and no form.
export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getI18n();
  const peek = token ? await peekInvitation(token) : { valid: false, email: null };
  if (!token || !peek.valid || !peek.email) {
    return <PublicShell title={t.portal.invite.invalidTitle} intro={t.portal.invite.invalidBody}>{null}</PublicShell>;
  }
  return (
    <PublicShell title={t.portal.invite.acceptTitle} intro={t.portal.invite.acceptIntro}>
      <AcceptForm token={token} email={peek.email} t={t} />
    </PublicShell>
  );
}
