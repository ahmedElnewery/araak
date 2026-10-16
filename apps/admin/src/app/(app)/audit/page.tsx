import { History, SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { EmptyState } from "@workspace/ui/components/empty-state";
import { FilterBar, FilterMenu, FilterOption, FilterSearch } from "@workspace/ui/components/filter-bar";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { PaginationBar } from "@workspace/ui/components/pagination-bar";
import { PeriodFields, periodLabel } from "@/components/period-fields";
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

  const columns: DataColumn<Row>[] = [
    { id: "time", header: a.colTime, primary: true, className: "md:whitespace-nowrap", cell: (r) => <DateTime value={r.occurredAt} locale={locale} /> },
    { id: "event", header: a.colEvent, label: a.colEvent, cell: (r) => eventLabel(r.event) },
    {
      id: "actor", header: a.colActor, label: a.colActor,
      cell: (r) => r.actor ? <LtrText>{r.actor.email}</LtrText>
        : r.actorKind === "operator" ? a.actorOperator.replace("{ref}", r.operatorRef ?? "") : a.actorSystem,
    },
    {
      id: "organization", header: a.colOrganization, label: a.colOrganization,
      cell: (r) => r.tenant ? <bdi dir="auto">{r.tenant.displayName}</bdi> : null,
    },
    {
      id: "details", header: a.details, label: a.details,
      cell: (r) => {
        const entries = Object.entries(r.metadata);
        return entries.length === 0 ? <span className="text-muted-foreground">{a.noDetails}</span> : (
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
        );
      },
    },
  ];

  return (
    <PageContainer labelledBy="platform-audit-title">
      <PageHeader titleId="platform-audit-title" title={a.title} description={a.intro} />

      <div className="space-y-2">
        <FilterBar action="/audit" label={a.filtersTitle} submitLabel={a.apply} link={Link} clear={filtered ? { href: "/audit", label: a.clear } : undefined}>
          <FilterSearch id="audit-q" name="q" label={a.search} placeholder={a.searchPlaceholder} defaultValue={f.q} maxLength={100} describedBy="audit-q-hint" />
          <FilterMenu label={a.eventType} value={f.event ? eventLabel(f.event) : a.allEvents} active={f.event !== null}>
            <FilterOption type="radio" name="event" value="" label={a.allEvents} defaultChecked={f.event === null} />
            {PLATFORM_EVENTS.map((e) => (
              <FilterOption key={e} type="radio" name="event" value={e} label={a.events[e]} defaultChecked={f.event === e} />
            ))}
          </FilterMenu>
          <FilterMenu label={a.period} value={periodLabel(f, locale, a.periodAll)} active={f.from !== null || f.to !== null}>
            <PeriodFields idPrefix="audit" from={f.from} to={f.to} labels={a} />
          </FilterMenu>
        </FilterBar>
        <p id="audit-q-hint" className="text-xs text-subtle">{a.searchHint}</p>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(r) => String(r.id)} caption={a.title} link={Link}
        rowProps={() => ({ "data-testid": "platform-audit-row" })}
        footer={
          <PaginationBar
            page={f.page} pages={pages} href={(p) => `/audit${platformAuditQuery(f, p)}`} link={Link} labels={a}
            summary={<span role="status">{a.count.replace("{count}", String(totalCount))}</span>}
          />
        }
        empty={filtered ? (
          <EmptyState
            icon={<SearchX />} title={a.emptyFiltered}
            action={<Link href="/audit" className={buttonVariants({ variant: "outline" })}>{a.clear}</Link>}
          />
        ) : <EmptyState icon={<History />} title={a.empty} />}
      />
    </PageContainer>
  );
}
