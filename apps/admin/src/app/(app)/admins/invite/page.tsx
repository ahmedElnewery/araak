import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { InviteForm } from "./invite-form";

export default async function InviteAdminPage() {
  const ctx = await requirePlatformAdmin("platform_admins.invite");
  const { t } = await getI18n();
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{t.admin.admins.inviteTitle}</h1>
      {/* only the actor's own capabilities are offered (the database enforces the subset rule regardless) */}
      <InviteForm t={t.admin} capabilities={ctx.capabilities as (keyof typeof t.admin.capabilities)[]} />
    </div>
  );
}
