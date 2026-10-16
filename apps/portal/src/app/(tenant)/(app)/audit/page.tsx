import { Download, History, SearchX, X } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { EmptyState } from "@workspace/ui/components/empty-state";
import { FilterBar, FilterMenu, FilterOption, FilterSearch } from "@workspace/ui/components/filter-bar";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { PaginationBar } from "@workspace/ui/components/pagination-bar";
import { StaffName, staffName } from "@workspace/ui/components/staff-name";
import { Tag } from "@workspace/ui/components/status-badge";
import { Code, EventDetails, PeriodFields, periodLabel } from "@/components/audit-parts";
import { DateTime } from "@/components/date-time";
import { EventDetailsSheet } from "@/components/event-details-sheet";
import { loadAuditEvent, loadAuditPage } from "@/features/audit/actions";
import { auditQuery, openEventId, PAGE_SIZE, parseAuditFilters, withEventId, type SearchParams } from "@/features/audit/filters";
import { actorText, label } from "@/features/audit/present";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

type AuditRow = Awaited<ReturnType<typeof loadAuditPage>>["rows"][number];

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
  const [onlyCategory] = f.categories;
  const categoriesValue = onlyCategory === undefined
    ? a.allCategories
    : f.categories.length === 1 ? a.categories[onlyCategory] : a.selectedCount.replace("{count}", String(f.categories.length));

  const columns: DataColumn<AuditRow>[] = [
    { id: "time", header: a.colTime, primary: true, className: "md:whitespace-nowrap", cell: (r) => <DateTime value={r.occurredAt} locale={locale} /> },
    { id: "category", header: a.colCategory, label: a.colCategory, cell: (r) => <Tag>{a.categories[r.category]}</Tag> },
    { id: "event", header: a.colEvent, label: a.colEvent, cell: (r) => label(a.events, r.event) },
    {
      id: "actor", header: a.colActor, label: a.colActor,
      cell: (r) => r.actor ? (
        <Link href={`/audit${auditQuery(f, { actor: r.actor.staffId, page: 1 })}`} className="rounded-sm hover:underline" aria-label={`${a.filterByActor}: ${staffName(r.actor)}`}>
          <StaffName staff={r.actor} />
        </Link>
      ) : actorText(r, a),
    },
    {
      id: "details", header: a.colDetails, srOnlyHeader: true, align: "end",
      cell: (r) => (
        <Link href={`/audit${withEventId(query, r.id)}`} scroll={false} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {a.viewDetails}<span className="sr-only">: {label(a.events, r.event)}</span>
        </Link>
      ),
    },
  ];

  return (
    <PageContainer labelledBy="audit-title">
      <PageHeader
        titleId="audit-title" title={a.title} description={a.intro}
        actions={
          // a plain link: the download is its own request, authorized again by the export route
          <a href={`/audit/export${auditQuery(f, { page: 1 })}`} className={buttonVariants({ variant: "outline", className: "h-10 rounded-[10px]" })} aria-describedby="audit-export-note">
            <Download aria-hidden="true" />
            {a.export}
          </a>
        }
      />

      <div className="space-y-2">
        <FilterBar
          action="/audit" label={a.filtersTitle} submitLabel={a.apply} link={Link}
          keep={{ actor: f.actor }} clear={filtered ? { href: "/audit", label: a.clear } : undefined}
        >
          <FilterSearch id="audit-q" name="q" label={a.search} placeholder={a.searchPlaceholder} defaultValue={f.q} maxLength={100} describedBy="audit-q-hint" />
          {data.categories.length > 1 ? (
            <FilterMenu label={a.categoriesLabel} value={categoriesValue} active={f.categories.length > 0}>
              {data.categories.map((c) => (
                <FilterOption key={c} name="category" value={c} label={a.categories[c]} defaultChecked={f.categories.includes(c)} />
              ))}
            </FilterMenu>
          ) : null}
          <FilterMenu label={a.period} value={periodLabel(f, locale, a.periodAll)} active={f.from !== null || f.to !== null}>
            <PeriodFields idPrefix="audit" from={f.from} to={f.to} labels={a} />
          </FilterMenu>
        </FilterBar>
        <p id="audit-q-hint" className="text-xs text-subtle">{a.searchHint}</p>
      </div>

      {f.actor ? (
        <p className="flex w-fit flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground">
          {a.actorFiltered}
          <Link href={`/audit${auditQuery(f, { actor: null, page: 1 })}`} className="inline-flex items-center gap-1 rounded-sm font-bold hover:underline">
            <X aria-hidden="true" className="size-3.5" />
            {a.removeFilter}
          </Link>
        </p>
      ) : null}

      <DataTable
        columns={columns} rows={data.rows} rowKey={(r) => String(r.id)} caption={a.title} link={Link}
        rowProps={() => ({ "data-testid": "audit-row" })}
        footer={
          <PaginationBar
            page={f.page} pages={pages} href={(p) => `/audit${auditQuery(f, { page: p })}`} link={Link} labels={a}
            summary={<span role="status">{a.count.replace("{count}", String(data.totalCount))}</span>}
          />
        }
        empty={filtered ? (
          <EmptyState
            icon={<SearchX />} title={a.emptyFiltered}
            action={<Link href="/audit" className={buttonVariants({ variant: "outline" })}>{a.clear}</Link>}
          />
        ) : <EmptyState icon={<History />} title={a.empty} />}
      />
      <p id="audit-export-note" className="text-xs text-subtle">{a.exportNote} {a.retentionNote}</p>

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
    </PageContainer>
  );
}
