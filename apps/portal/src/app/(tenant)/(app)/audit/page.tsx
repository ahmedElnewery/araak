import Link from "next/link";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { StaffName, staffName } from "@workspace/ui/components/staff-name";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { AuditPagination, Code, EventDetails } from "@/components/audit-parts";
import { DateTime } from "@/components/date-time";
import { EventDetailsSheet } from "@/components/event-details-sheet";
import { loadAuditEvent, loadAuditPage } from "@/features/audit/actions";
import { auditQuery, openEventId, PAGE_SIZE, parseAuditFilters, withEventId, type SearchParams } from "@/features/audit/filters";
import { actorText, label } from "@/features/audit/present";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

// Tenant audit viewer (FR-031, CL-032, US6 scenarios 1-2a). Every filter, count, page and detail is computed by the
// database after intersecting with the viewer's categories; this page only renders what came back.
export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("audit_logs.view");
  const sp = await searchParams;
  const f = parseAuditFilters(sp);
  const openId = openEventId(sp);
  const { locale, dir, t } = await getI18n();
  const a = t.portal.audit;
  const [data, open] = await Promise.all([loadAuditPage(ctx, f), openId === null ? null : loadAuditEvent(ctx, openId)]);
  const query = auditQuery(f);
  const pages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));
  const filtered = f.categories.length > 0 || f.from !== null || f.to !== null || f.actor !== null || f.q !== null;
  return (
    <section className="space-y-6" aria-labelledby="audit-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="audit-title" className="text-xl font-semibold">{a.title}</h1>
        {/* a plain link: the download is its own request, authorized again by the export route */}
        <a href={`/audit/export${auditQuery(f, { page: 1 })}`} className={buttonVariants({ variant: "outline" })} aria-describedby="audit-export-note">
          {a.export}
        </a>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{a.intro}</p>
        <p id="audit-export-note">{a.exportNote} {a.retentionNote}</p>
      </div>

      <form action="/audit" method="get" className="space-y-4 rounded-md border p-4" aria-labelledby="audit-filters-title">
        <h2 id="audit-filters-title" className="text-sm font-medium">{a.filtersTitle}</h2>
        {data.categories.length > 1 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm">{a.categoriesLabel}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {data.categories.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="category" value={c} defaultChecked={f.categories.includes(c)} className="size-4 accent-primary" />
                  {a.categories[c]}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="audit-from">{a.from}</Label>
            <Input id="audit-from" type="date" name="from" defaultValue={f.from ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">{a.to}</Label>
            <Input id="audit-to" type="date" name="to" defaultValue={f.to ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-q">{a.search}</Label>
            <Input id="audit-q" type="search" name="q" maxLength={100} defaultValue={f.q ?? ""} aria-describedby="audit-q-hint" />
            <p id="audit-q-hint" className="text-xs text-muted-foreground">{a.searchHint}</p>
          </div>
        </div>
        {f.actor ? <input type="hidden" name="actor" value={f.actor} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{a.apply}</Button>
          {filtered ? <Link href="/audit" className={buttonVariants({ variant: "ghost" })}>{a.clear}</Link> : null}
        </div>
      </form>

      {f.actor ? (
        <p className="text-sm">
          {a.actorFiltered}{" "}
          <Link href={`/audit${auditQuery(f, { actor: null, page: 1 })}`} className="underline">{a.removeFilter}</Link>
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground" role="status">{a.count.replace("{count}", String(data.totalCount))}</p>

      {data.rows.length === 0 ? <p className="text-muted-foreground">{filtered ? a.emptyFiltered : a.empty}</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{a.colTime}</TableHead>
              <TableHead scope="col">{a.colCategory}</TableHead>
              <TableHead scope="col">{a.colEvent}</TableHead>
              <TableHead scope="col">{a.colActor}</TableHead>
              <TableHead scope="col"><span className="sr-only">{a.colDetails}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.id} data-testid="audit-row">
                <TableCell className="whitespace-nowrap"><DateTime value={r.occurredAt} locale={locale} /></TableCell>
                <TableCell>{a.categories[r.category]}</TableCell>
                <TableCell>{label(a.events, r.event)}</TableCell>
                <TableCell>
                  {r.actor ? (
                    <Link href={`/audit${auditQuery(f, { actor: r.actor.staffId, page: 1 })}`} className="underline" aria-label={`${a.filterByActor}: ${staffName(r.actor)}`}>
                      <StaffName staff={r.actor} />
                    </Link>
                  ) : actorText(r, a)}
                </TableCell>
                <TableCell>
                  <Link href={`/audit${withEventId(query, r.id)}`} scroll={false} className="underline">
                    {a.viewDetails}<span className="sr-only">: {label(a.events, r.event)}</span>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AuditPagination page={f.page} pages={pages} href={(p) => `/audit${auditQuery(f, { page: p })}`} labels={a} />

      {open ? (
        <EventDetailsSheet dir={dir} title={a.detailTitle} description={label(a.events, open.event)} closeLabel={t.common.close} closeHref={`/audit${query}`}>
          <EventDetails
            labels={{ details: a.colDetails, noDetails: a.noDetails }}
            metadata={open.metadata}
            fields={[
              { term: a.colTime, value: <DateTime value={open.occurredAt} locale={locale} /> },
              { term: a.colCategory, value: a.categories[open.category] },
              { term: a.colEvent, value: label(a.events, open.event) },
              { term: a.eventCode, value: <Code>{open.event}</Code> },
              { term: a.colActor, value: open.actor ? <StaffName staff={open.actor} /> : actorText(open, a) },
              ...(open.resourceId ? [{ term: a.colResource, value: <Code>{open.resourceId}</Code> }] : []),
            ]}
          />
        </EventDetailsSheet>
      ) : null}
    </section>
  );
}
