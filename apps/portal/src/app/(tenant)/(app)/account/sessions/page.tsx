import { requireStaff } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { SessionsTable, type SessionRow } from "./sessions-table";

export default async function SessionsPage() {
  const ctx = await requireStaff();
  const { locale, t } = await getI18n();
  const { data } = await ctx.supabase.rpc("list_my_sessions");
  return (
    <section className="space-y-6" aria-labelledby="sessions-title">
      <h1 id="sessions-title" className="text-xl font-semibold">{t.portal.sessions.title}</h1>
      <p className="text-sm text-muted-foreground">{t.portal.sessions.intro}</p>
      <SessionsTable rows={(data ?? []) as SessionRow[]} t={t} locale={locale} />
    </section>
  );
}
