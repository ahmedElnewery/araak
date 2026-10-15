import { PublicShell } from "@/components/public-shell";
import { isRecoveryLinkValid } from "@/features/recovery/complete-action";
import { getI18n } from "@/lib/locale";
import { CompleteForm } from "./complete-form";

export default async function RecoverCompletePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getI18n();
  if (!token || !(await isRecoveryLinkValid(token))) {
    return <PublicShell title={t.portal.recovery.invalidTitle} intro={t.portal.recovery.invalidBody}>{null}</PublicShell>;
  }
  return (
    <PublicShell title={t.portal.recovery.completeTitle} intro={t.portal.recovery.completeIntro}>
      <CompleteForm token={token} t={t} />
    </PublicShell>
  );
}
