import { Download, SearchX, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SECURITY_EVENT_TYPES } from "@workspace/authorization";
import { buttonVariants } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { EmptyState } from "@workspace/ui/components/empty-state";
import { FilterBar, FilterMenu, FilterOption, FilterSearch } from "@workspace/ui/components/filter-bar";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { PaginationBar } from "@workspace/ui/components/pagination-bar";
import { StaffName } from "@workspace/ui/components/staff-name";
import { Code, EventDetails, PeriodFields, periodLabel } from "@/components/audit-parts";
import { DateTime } from "@/components/date-time";
import { EventDetailsSheet } from "@/components/event-details-sheet";
import { loadSecurityEvent, loadSecurityPage } from "@/features/audit/actions";
import { openEventId, PAGE_SIZE, parseSecurityFilters, securityQuery, withEventId, type SearchParams } from "@/features/audit/filters";
import { actorText, label } from "@/features/audit/present";
import { requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

type SecurityRow = Awaited<ReturnType<typeof loadSecurityPage>>["rows"][number];

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

  const columns: DataColumn<SecurityRow>[] = [
    { id: "time", header: a.colTime, primary: true, className: "md:whitespace-nowrap", cell: (r) => <DateTime value={r.occurredAt} locale={locale} /> },
    { id: "event", header: a.colEvent, label: a.colEvent, cell: (r) => label(s.events, r.event) },
    { id: "actor", header: a.colActor, label: a.colActor, cell: (r) => (r.actor ? <StaffName staff={r.actor} /> : actorText(r, a)) },
    {
      id: "details", header: a.colDetails, srOnlyHeader: true, align: "end",
      cell: (r) => (
        <Link href={`/security-logs${withEventId(query, r.id)}`} scroll={false} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {a.viewDetails}<span className="sr-only">: {label(s.events, r.event)}</span>
        </Link>
      ),
    },
  ];

  return (
    <PageContainer labelledBy="security-title">
      <PageHeader
        titleId="security-title" title={s.title} description={s.intro}
        actions={
          <a href={`/security-logs/export${securityQuery(f, { page: 1 })}`} className={buttonVariants({ variant: "outline", className: "h-10 rounded-[10px]" })} aria-describedby="security-export-note">
            <Download aria-hidden="true" />
            {s.export}
          </a>
        }
      />

      <div className="space-y-2">
        <FilterBar
          action="/security-logs" label={a.filtersTitle} submitLabel={a.apply} link={Link}
          clear={filtered ? { href: "/security-logs", label: a.clear } : undefined}
        >
          <FilterSearch id="security-q" name="q" label={a.search} placeholder={a.searchPlaceholder} defaultValue={f.q} maxLength={100} describedBy="security-q-hint" />
          <FilterMenu label={s.eventType} value={f.event ? label(s.events, f.event) : s.allEvents} active={f.event !== null}>
            <FilterOption type="radio" name="event" value="" label={s.allEvents} defaultChecked={f.event === null} />
            {SECURITY_EVENT_TYPES.map((e) => (
              <FilterOption key={e} type="radio" name="event" value={e} label={s.events[e]} defaultChecked={f.event === e} />
            ))}
          </FilterMenu>
          <FilterMenu label={a.period} value={periodLabel(f, locale, a.periodAll)} active={f.from !== null || f.to !== null}>
            <PeriodFields idPrefix="security" from={f.from} to={f.to} labels={a} />
          </FilterMenu>
        </FilterBar>
        <p id="security-q-hint" className="text-xs text-subtle">{a.searchHint}</p>
      </div>

      <DataTable
        columns={columns} rows={data.rows} rowKey={(r) => String(r.id)} caption={s.title} link={Link}
        rowProps={() => ({ "data-testid": "security-row" })}
        footer={
          <PaginationBar
            page={f.page} pages={pages} href={(p) => `/security-logs${securityQuery(f, { page: p })}`} link={Link} labels={a}
            summary={<span role="status">{a.count.replace("{count}", String(data.totalCount))}</span>}
          />
        }
        empty={filtered ? (
          <EmptyState
            icon={<SearchX />} title={s.emptyFiltered}
            action={<Link href="/security-logs" className={buttonVariants({ variant: "outline" })}>{a.clear}</Link>}
          />
        ) : <EmptyState icon={<ShieldCheck />} title={s.empty} />}
      />
      <p id="security-export-note" className="text-xs text-subtle">{a.exportNote} {s.retentionNote}</p>

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
    </PageContainer>
  );
}
