import { PageContainer } from "@workspace/ui/components/page-header";
import { accountCrumb } from "@/lib/breadcrumbs";
import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { SessionsView, type SessionRow } from "./sessions-table";

export default async function SessionsPage() {
  const ctx = await requireStaff();
  const { locale, t } = await getI18n();
  const { data } = await ctx.supabase.rpc("list_my_sessions");
  return (
    <PageContainer labelledBy="sessions-title">
      <SessionsView rows={(data ?? []) as SessionRow[]} t={t} locale={locale} accountCrumb={accountCrumb(t)} />
    </PageContainer>
  );
}
