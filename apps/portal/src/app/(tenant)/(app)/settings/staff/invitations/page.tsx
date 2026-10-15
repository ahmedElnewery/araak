import { can, loadEffectivePermissions } from "@workspace/authorization";
import { renewSession, requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { redirect } from "next/navigation";
import { InvitationsTable, type PendingInvitation } from "./invitations-table";

export default async function PendingInvitationsPage() {
  const ctx = await requireStaff({ touch: false });
  const perms = await loadEffectivePermissions(ctx);
  if (!can(perms, "staff.invite") && !can(perms, "staff.view")) redirect("/forbidden");
  await renewSession(ctx);
  const { locale, t } = await getI18n();
  const { data } = await ctx.supabase.rpc("list_pending_invitations");
  return (
    <section className="space-y-6" aria-labelledby="pending-title">
      <h1 id="pending-title" className="text-xl font-semibold">{t.portal.staff.pendingTitle}</h1>
      <InvitationsTable rows={(data ?? []) as PendingInvitation[]} canResend={ctx.isManager} t={t} locale={locale} />
      <p className="text-sm text-muted-foreground">{t.portal.staff.noCancelNote}</p>
    </section>
  );
}
