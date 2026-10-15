import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { getI18n } from "@/lib/locale";
import { RequestForm } from "./request-form";

export default async function RecoverPage() {
  const { t } = await getI18n();
  return (
    <PublicShell title={t.portal.recovery.requestTitle} intro={t.portal.recovery.requestIntro}>
      <RequestForm t={t.portal.recovery} />
      <p className="text-sm"><Link className="underline" href="/login">{t.portal.recovery.backToSignIn}</Link></p>
    </PublicShell>
  );
}
