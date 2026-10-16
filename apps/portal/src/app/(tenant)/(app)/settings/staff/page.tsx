import Link from "next/link";
import { can } from "@workspace/authorization";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { StaffName } from "@workspace/ui/components/staff-name";
import { loadPermissions, requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

type StaffRow = {
  id: string; username: string; firstName: string | null; lastName: string | null; email: string; enabled: boolean; isManager: boolean;
  roles: { id: string; name: string }[];
};

export default async function StaffDirectoryPage() {
  const ctx = await requirePermission("staff.view");
  const { t } = await getI18n();
  const canInvite = can(await loadPermissions(ctx), "staff.invite");
  const { data } = await ctx.supabase.rpc("list_staff");
  const rows = (data ?? []) as StaffRow[];
  return (
    <section className="space-y-6" aria-labelledby="staff-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="staff-title" className="text-xl font-semibold">{t.portal.staff.directoryTitle}</h1>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/settings/staff/invitations" className="text-sm underline">{t.portal.staff.pendingLink}</Link>
          {/* the invite page is not in the navigation for anyone who sees this directory (lib/navigation.ts) */}
          {canInvite ? <Link href="/settings/staff/invite" className={buttonVariants()}>{t.portal.nav.inviteStaff}</Link> : null}
        </div>
      </div>
      {rows.length === 0 ? <p className="text-muted-foreground">{t.portal.staff.noStaff}</p> : (
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-2 text-start">{t.portal.staff.colName}</th>
              <th scope="col" className="p-2 text-start">{t.portal.staff.colRoles}</th>
              <th scope="col" className="p-2 text-start">{t.portal.staff.colState}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b" data-testid="staff-row">
                <td className="p-2">
                  <Link href={`/settings/staff/${r.id}`} className="underline"><StaffName staff={r} /></Link>
                  {r.isManager ? <Badge className="ms-2" variant="secondary">{t.portal.staff.managerBadge}</Badge> : null}
                </td>
                <td className="p-2"><span dir="auto">{r.roles.map((x) => x.name).join(", ") || t.portal.staff.noRolesAssigned}</span></td>
                <td className="p-2">{r.enabled ? t.portal.staff.stateEnabled : t.portal.staff.stateDisabled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
