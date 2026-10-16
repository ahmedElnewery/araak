import { redirect } from "next/navigation";
import { can } from "@workspace/authorization";
import { PageContainer } from "@workspace/ui/components/page-header";
import { loadPermissions, renewSession, requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { StaffHeader, STAFF_TITLE_ID } from "../staff-header";
import { InvitationsTable, type PendingInvitation } from "./invitations-table";

export default async function PendingInvitationsPage() {
  const ctx = await requireStaff({ touch: false });
  const perms = await loadPermissions(ctx);
  if (!can(perms, "staff.invite") && !can(perms, "staff.view")) redirect("/forbidden");
  await renewSession(ctx);
  const { locale, t } = await getI18n();
  const canView = can(perms, "staff.view");
  const [{ data }, staff] = await Promise.all([
    ctx.supabase.rpc("list_pending_invitations"),
    canView ? ctx.supabase.rpc("list_staff") : null,
  ]);
  const rows = (data ?? []) as PendingInvitation[];
  return (
    <PageContainer labelledBy={STAFF_TITLE_ID}>
      <StaffHeader
        perms={perms} t={t} active="invitations"
        counts={{ staff: (staff?.data as unknown[] | null | undefined)?.length, invitations: rows.length }}
      />
      <InvitationsTable rows={rows} canResend={ctx.isManager} t={t} locale={locale} />
      <p className="text-sm text-muted-foreground">{t.portal.staff.noCancelNote}</p>
    </PageContainer>
  );
}
