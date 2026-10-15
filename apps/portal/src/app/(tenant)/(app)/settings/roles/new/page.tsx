import Link from "next/link";
import { offerableSwitches } from "@workspace/authorization";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { RoleForm } from "../role-form";

export default async function NewRolePage() {
  const ctx = await requirePermission("roles.create");
  const { t } = await getI18n();
  return (
    <section className="space-y-6" aria-labelledby="new-role-title">
      <Link href="/settings/roles" className="text-sm underline">{t.portal.roles.back}</Link>
      <h1 id="new-role-title" className="text-xl font-semibold">{t.portal.roles.newTitle}</h1>
      <RoleForm roleId={null} name="" description="" offered={offerableSwitches(ctx.permissions)} on={[]} readOnly={false} extra={false} t={t} />
    </section>
  );
}
