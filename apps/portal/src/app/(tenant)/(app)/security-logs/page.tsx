import Link from "next/link";
import { SECURITY_EVENT_TYPES } from "@workspace/authorization";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { StaffName } from "@workspace/ui/components/staff-name";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { AuditPagination, Code, EventDetails } from "@/components/audit-parts";
import { DateTime } from "@/components/date-time";
import { EventDetailsSheet } from "@/components/event-details-sheet";
import { loadSecurityEvent, loadSecurityPage } from "@/features/audit/actions";
import { openEventId, PAGE_SIZE, parseSecurityFilters, securityQuery, withEventId, type SearchParams } from "@/features/audit/filters";
import { actorText, label } from "@/features/audit/present";
import { requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

// Security Logs (FR-033, CL-035): the active tenant manager only. Never linked from or authorized by audit_logs.view;
// the database checks manager status again for the list, count, detail and export.
export default async function SecurityLogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireManager();
  const sp = await searchParams;
  const f = parseSecurityFilters(sp);
  const openId = openEventId(sp);
  const { locale, dir, t } = await getI18n();
  const a = t.portal.audit;
  const s = t.portal.securityLogs;
  const [data, open] = await Promise.all([loadSecurityPage(ctx, f), openId === null ? null : loadSecurityEvent(ctx, openId)]);
  const query = securityQuery(f);
  const pages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));
  const filtered = f.event !== null || f.from !== null || f.to !== null || f.q !== null;
  return (
    <section className="space-y-6" aria-labelledby="security-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="security-title" className="text-xl font-semibold">{s.title}</h1>
        <a href={`/security-logs/export${securityQuery(f, { page: 1 })}`} className={buttonVariants({ variant: "outline" })} aria-describedby="security-export-note">
          {s.export}
        </a>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{s.intro}</p>
        <p id="security-export-note">{a.exportNote} {s.retentionNote}</p>
      </div>

      <form action="/security-logs" method="get" className="space-y-4 rounded-md border p-4" aria-labelledby="security-filters-title">
        <h2 id="security-filters-title" className="text-sm font-medium">{a.filtersTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="security-event">{s.eventType}</Label>
            <select id="security-event" name="event" defaultValue={f.event ?? ""}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
              <option value="">{s.allEvents}</option>
              {SECURITY_EVENT_TYPES.map((e) => <option key={e} value={e}>{s.events[e]}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="security-q">{a.search}</Label>
            <Input id="security-q" type="search" name="q" maxLength={100} defaultValue={f.q ?? ""} aria-describedby="security-q-hint" />
            <p id="security-q-hint" className="text-xs text-muted-foreground">{a.searchHint}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="security-from">{a.from}</Label>
            <Input id="security-from" type="date" name="from" defaultValue={f.from ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="security-to">{a.to}</Label>
            <Input id="security-to" type="date" name="to" defaultValue={f.to ?? ""} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{a.apply}</Button>
          {filtered ? <Link href="/security-logs" className={buttonVariants({ variant: "ghost" })}>{a.clear}</Link> : null}
        </div>
      </form>

      <p className="text-sm text-muted-foreground" role="status">{a.count.replace("{count}", String(data.totalCount))}</p>

      {data.rows.length === 0 ? <p className="text-muted-foreground">{filtered ? s.emptyFiltered : s.empty}</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{a.colTime}</TableHead>
              <TableHead scope="col">{a.colEvent}</TableHead>
              <TableHead scope="col">{a.colActor}</TableHead>
              <TableHead scope="col"><span className="sr-only">{a.colDetails}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.id} data-testid="security-row">
                <TableCell className="whitespace-nowrap"><DateTime value={r.occurredAt} locale={locale} /></TableCell>
                <TableCell>{label(s.events, r.event)}</TableCell>
                <TableCell>{r.actor ? <StaffName staff={r.actor} /> : actorText(r, a)}</TableCell>
                <TableCell>
                  <Link href={`/security-logs${withEventId(query, r.id)}`} scroll={false} className="underline">
                    {a.viewDetails}<span className="sr-only">: {label(s.events, r.event)}</span>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AuditPagination page={f.page} pages={pages} href={(p) => `/security-logs${securityQuery(f, { page: p })}`} labels={a} />

      {open ? (
        <EventDetailsSheet dir={dir} title={s.detailTitle} description={label(s.events, open.event)} closeLabel={t.common.close} closeHref={`/security-logs${query}`}>
          <EventDetails
            labels={{ details: a.colDetails, noDetails: a.noDetails }}
            metadata={open.metadata}
            fields={[
              { term: a.colTime, value: <DateTime value={open.occurredAt} locale={locale} /> },
              { term: a.colEvent, value: label(s.events, open.event) },
              { term: a.eventCode, value: <Code>{open.event}</Code> },
              { term: a.colActor, value: open.actor ? <StaffName staff={open.actor} /> : actorText(open, a) },
            ]}
          />
        </EventDetailsSheet>
      ) : null}
    </section>
  );
}
