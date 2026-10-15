import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

// Minimal welcome: no KPIs, charts, widgets or global search (FR-040, Constitution X).
export default async function Home() {
  const ctx = await requireStaff();
  const { t } = await getI18n();
  return (
    <section className="space-y-2" aria-labelledby="home-title">
      <h1 id="home-title" className="text-xl font-semibold">{t.portal.home.welcome} · <bdi dir="ltr">{ctx.username}</bdi></h1>
      <p className="text-muted-foreground">{t.portal.home.intro}</p>
    </section>
  );
}
