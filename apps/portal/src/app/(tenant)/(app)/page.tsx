import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

export default async function Home() {
  const ctx = await requireStaff();
  const { t } = await getI18n();
  return <h1 className="text-xl font-semibold">{t.portal.nav.home} · <bdi dir="ltr">{ctx.username}</bdi></h1>;
}
