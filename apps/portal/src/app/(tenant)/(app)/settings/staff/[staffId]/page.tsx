import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { can } from "@workspace/authorization";
import { Badge } from "@workspace/ui/components/badge";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { StaffName } from "@/components/staff-name";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { RolesEditor } from "./roles-editor";
import { StatusControl } from "./status-control";

type StaffDetail = {
  id: string; username: string; firstName: string | null; lastName: string | null; email: string; enabled: boolean; isManager: boolean;
  roles: { id: string; name: string; canGrant: boolean }[];
};

export default async function StaffDetailPage({ params }: { params: Promise<{ staffId: string }> }) {
  const ctx = await requirePermission("staff.view");
  const { staffId } = await params;
  if (!z.uuid().safeParse(staffId).success) notFound();
  const { t } = await getI18n();
  const { data, error } = await ctx.supabase.rpc("get_staff", { p_staff_id: staffId });
  if (error || !data) notFound();
  const person = data as StaffDetail;
  const isSelf = person.id === ctx.staffId;

  // Own record: no role editor and no disable control at all (CL-044); the server denies a forged request regardless.
  const canAssign = can(ctx.permissions, "staff.roles.assign") && !isSelf;
  let assignable: { id: string; name: string }[] = [];
  if (canAssign) {
    const { data: g } = await ctx.supabase.rpc("list_grantable_roles");
    assignable = (g ?? []) as { id: string; name: string }[];
  }
  const held = person.roles.filter((r) => r.canGrant);
  const options = [...assignable, ...held.filter((h) => !assignable.some((a) => a.id === h.id)).map(({ id, name }) => ({ id, name }))]
    .sort((a, b) => a.name.localeCompare(b.name));
  const canToggle = !isSelf && (person.enabled ? can(ctx.permissions, "staff.disable") : can(ctx.permissions, "staff.enable"));

  return (
    <section className="space-y-6" aria-labelledby="staff-name">
      <Link href="/settings/staff" className="text-sm underline">{t.portal.staff.back}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="staff-name" className="text-xl font-semibold"><StaffName staff={person} /></h1>
        {person.isManager ? <Badge variant="secondary">{t.portal.staff.managerBadge}</Badge> : null}
        <span className="text-sm text-muted-foreground">{person.enabled ? t.portal.staff.stateEnabled : t.portal.staff.stateDisabled}</span>
      </div>
      {/* the heading shows the name; the username stays visible here because it is what the person signs in with */}
      {person.firstName ? (
        <p className="text-sm"><span className="text-muted-foreground">{t.portal.staff.username}: </span><LtrText>{person.username}</LtrText></p>
      ) : null}
      <p><LtrText>{person.email}</LtrText></p>

      <div className="space-y-2">
        <h2 className="font-medium">{t.portal.staff.rolesEditorTitle}</h2>
        {canAssign ? <RolesEditor staffId={person.id} options={options} selected={held.map((r) => r.id)} t={t} /> : (
          <>
            <p className="text-sm" dir="auto">{person.roles.map((r) => r.name).join(", ") || t.portal.staff.noRolesAssigned}</p>
            {isSelf ? <p className="text-sm text-muted-foreground">{t.portal.staff.ownRolesNote}</p> : null}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canToggle ? <StatusControl staffId={person.id} enabled={person.enabled} t={t} /> : null}
        {ctx.isManager && person.enabled && !isSelf ? <ResetPasswordDialog staffId={person.id} t={t} /> : null}
      </div>
    </section>
  );
}
