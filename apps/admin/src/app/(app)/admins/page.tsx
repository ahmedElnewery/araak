import Link from "next/link";
import { buttonVariants } from "@workspace/ui/components/button";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";

// No list, remove, demote or disable control exists for platform admins: removal is operations-only (CL-041).
export default async function AdminsPage() {
  await requirePlatformAdmin("platform_admins.invite");
  const { t } = await getI18n();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">{t.admin.admins.title}</h1>
      <p className="text-muted-foreground">{t.admin.admins.intro}</p>
      <p className="text-sm text-muted-foreground">{t.admin.admins.noRemoval}</p>
      <Link href="/admins/invite" className={buttonVariants()}>{t.admin.admins.invite}</Link>
    </div>
  );
}
