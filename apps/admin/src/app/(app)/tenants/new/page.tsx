import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { CreateTenantForm } from "./create-tenant-form";

export default async function NewTenantPage() {
  await requirePlatformAdmin("tenants.manage");
  const { t } = await getI18n();
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{t.admin.tenants.newTitle}</h1>
      <CreateTenantForm t={t.admin} />
    </div>
  );
}
