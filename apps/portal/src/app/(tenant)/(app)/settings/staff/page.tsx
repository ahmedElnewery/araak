import Link from "next/link";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { Badge } from "@workspace/ui/components/badge";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

type StaffRow = { id: string; username: string; email: string; enabled: boolean; isManager: boolean; roles: { id: string; name: string }[] };

export default async function StaffDirectoryPage() {
  const ctx = await requirePermission("staff.view");
  const { t } = await getI18n();
  const { data } = await ctx.supabase.rpc("list_staff");
  const rows = (data ?? []) as StaffRow[];
  return (
    <section className="space-y-6" aria-labelledby="staff-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="staff-title" className="text-xl font-semibold">{t.portal.staff.directoryTitle}</h1>
        <Link href="/settings/staff/invitations" className="text-sm underline">{t.portal.staff.pendingLink}</Link>
      </div>
      {rows.length === 0 ? <p className="text-muted-foreground">{t.portal.staff.noStaff}</p> : (
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-2 text-start">{t.portal.staff.colUsername}</th>
              <th scope="col" className="p-2 text-start">{t.portal.staff.colRoles}</th>
              <th scope="col" className="p-2 text-start">{t.portal.staff.colState}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b" data-testid="staff-row">
                <td className="p-2">
                  <Link href={`/settings/staff/${r.id}`} className="underline"><LtrText>{r.username}</LtrText></Link>
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
