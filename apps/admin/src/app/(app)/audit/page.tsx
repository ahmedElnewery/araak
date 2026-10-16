import Link from "next/link";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { DateTime } from "@/components/date-time";
import { PAGE_SIZE, PLATFORM_EVENTS, parsePlatformAuditFilters, platformAuditQuery, platformAuditRpcArgs, type SearchParams } from "@/features/audit/filters";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";

type Row = {
  id: number; occurredAt: string; event: string; actorKind: "platform_admin" | "operator" | "system";
  actor: { id: string; email: string } | null; operatorRef: string | null;
  tenant: { id: string; displayName: string } | null; metadata: Record<string, unknown>;
};

// Platform audit (FR-031, US6 scenario 4): platform events only, for `platform_audit.view`. Tenant audit and Security
// Logs are never read here; the database refuses this list to anyone without the capability.
export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePlatformAdmin("platform_audit.view");
  const f = parsePlatformAuditFilters(await searchParams);
  const { locale, t } = await getI18n();
  const a = t.admin.audit;
  const { data, error } = await ctx.supabase.rpc("platform_list_audit", platformAuditRpcArgs(f));
  if (error) throw new Error("platform_audit_unavailable");
  const { rows, totalCount } = data as unknown as { rows: Row[]; totalCount: number };
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const filtered = f.event !== null || f.from !== null || f.to !== null || f.q !== null;
  const eventLabel = (code: string) => (a.events as Record<string, string | undefined>)[code] ?? code;
  const actor = (r: Row) =>
    r.actor ? <bdi dir="ltr">{r.actor.email}</bdi>
      : r.actorKind === "operator" ? a.actorOperator.replace("{ref}", r.operatorRef ?? "") : a.actorSystem;
  const pageLink = (enabled: boolean, page: number, text: string) =>
    enabled ? <Link href={`/audit${platformAuditQuery(f, page)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>{text}</Link>
      : <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>{text}</span>;

  return (
    <section className="space-y-6" aria-labelledby="platform-audit-title">
      <h1 id="platform-audit-title" className="text-xl font-semibold">{a.title}</h1>
      <p className="text-sm text-muted-foreground">{a.intro}</p>

      <form action="/audit" method="get" className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="audit-event">{a.eventType}</Label>
          <select id="audit-event" name="event" defaultValue={f.event ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">{a.allEvents}</option>
            {PLATFORM_EVENTS.map((e) => <option key={e} value={e}>{a.events[e]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-q">{a.search}</Label>
          <Input id="audit-q" type="search" name="q" maxLength={100} defaultValue={f.q ?? ""} aria-describedby="audit-q-hint" />
          <p id="audit-q-hint" className="text-xs text-muted-foreground">{a.searchHint}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-from">{a.from}</Label>
          <Input id="audit-from" type="date" name="from" defaultValue={f.from ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to">{a.to}</Label>
          <Input id="audit-to" type="date" name="to" defaultValue={f.to ?? ""} />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit">{a.apply}</Button>
          {filtered ? <Link href="/audit" className={buttonVariants({ variant: "ghost" })}>{a.clear}</Link> : null}
        </div>
      </form>

      <p className="text-sm text-muted-foreground" role="status">{a.count.replace("{count}", String(totalCount))}</p>

      {rows.length === 0 ? <p className="text-muted-foreground">{filtered ? a.emptyFiltered : a.empty}</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{a.colTime}</TableHead>
              <TableHead scope="col">{a.colEvent}</TableHead>
              <TableHead scope="col">{a.colActor}</TableHead>
              <TableHead scope="col">{a.colOrganization}</TableHead>
              <TableHead scope="col">{a.details}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const entries = Object.entries(r.metadata);
              return (
                <TableRow key={r.id} data-testid="platform-audit-row" className="align-top">
                  <TableCell className="whitespace-nowrap"><DateTime value={r.occurredAt} locale={locale} /></TableCell>
                  <TableCell>{eventLabel(r.event)}</TableCell>
                  <TableCell>{actor(r)}</TableCell>
                  <TableCell>{r.tenant ? <bdi dir="auto">{r.tenant.displayName}</bdi> : null}</TableCell>
                  <TableCell>
                    {entries.length === 0 ? <span className="text-muted-foreground">{a.noDetails}</span> : (
                      <details>
                        <summary className="cursor-pointer text-sm underline">{a.details}</summary>
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs" dir="ltr">
                          <dt className="text-muted-foreground">{a.colEvent}</dt><dd>{r.event}</dd>
                          {entries.map(([k, v]) => (
                            <div key={k} className="contents">
                              <dt className="text-muted-foreground">{k}</dt>
                              <dd className="break-all">{v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {pages > 1 ? (
        <nav aria-label={a.pagination} className="flex flex-wrap items-center justify-between gap-3">
          {pageLink(f.page > 1, f.page - 1, a.previous)}
          <span className="text-sm text-muted-foreground">{a.pageOf.replace("{page}", String(f.page)).replace("{pages}", String(pages))}</span>
          {pageLink(f.page < pages, f.page + 1, a.next)}
        </nav>
      ) : null}
    </section>
  );
}
