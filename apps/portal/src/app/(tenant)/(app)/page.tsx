import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { StaffName } from "@workspace/ui/components/staff-name";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

// Minimal welcome: no KPIs, charts, widgets or global search (FR-040, Constitution X).
export default async function Home() {
  const ctx = await requireStaff();
  const { t } = await getI18n();
  const [before, after] = t.portal.home.greeting.split("{name}");
  return (
    <PageContainer labelledBy="home-title">
      <PageHeader titleId="home-title" title={<>{before}<StaffName staff={ctx} />{after}</>} description={t.portal.home.intro} />
    </PageContainer>
  );
}
