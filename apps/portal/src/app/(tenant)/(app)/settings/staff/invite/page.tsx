import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { InviteForm } from "./invite-form";

export default async function InviteStaffPage() {
  const ctx = await requirePermission("staff.invite");
  const { t } = await getI18n();
  // only roles this actor may grant (the database ceiling is authoritative); no scopes or permission keys are shown
  const { data } = await ctx.supabase.rpc("list_grantable_roles");
  const roles = (data ?? []) as { id: string; name: string }[];
  return (
    <section className="space-y-6" aria-labelledby="invite-title">
      <h1 id="invite-title" className="text-xl font-semibold">{t.portal.staff.inviteTitle}</h1>
      <InviteForm roles={roles} t={t} />
    </section>
  );
}
