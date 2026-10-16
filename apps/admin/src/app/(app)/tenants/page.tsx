import { Building2, Plus, SearchX } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@workspace/i18n";
import { buttonVariants } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { EmptyState } from "@workspace/ui/components/empty-state";
import { FilterBar, FilterMenu, FilterOption, FilterSearch } from "@workspace/ui/components/filter-bar";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { StatusBadge } from "@workspace/ui/components/status-badge";
import { applyTenantFilters, parseTenantFilters, tenantQuery, type TenantFilters, type TenantRow } from "@/features/tenants/directory";
import { getI18n } from "@/lib/locale";
import { TENANT_CAPABILITIES, requirePlatformAdminAny } from "@/lib/platform-guards";

export default async function TenantsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePlatformAdminAny(TENANT_CAPABILITIES);
  const f = parseTenantFilters(await searchParams);
  const { locale, t } = await getI18n();
  const tn = t.admin.tenants;
  // Metadata only: no tenant-private data is ever listed here (FR-029).
  const { data } = await ctx.supabase.rpc("platform_list_tenants");
  const all = (data ?? []) as TenantRow[];
  const rows = applyTenantFilters(all, f, locale);
  const href = (o: Partial<TenantFilters>) => `/tenants${tenantQuery(f, o)}`;
  const filtered = f.q !== null || f.state !== null;
  const canCreate = ctx.capabilities.includes("tenants.manage");
  const create = canCreate ? (
    <Link href="/tenants/new" className={buttonVariants({ className: "h-10 rounded-[10px]" })}>
      <Plus aria-hidden="true" />
      {tn.new}
    </Link>
  ) : null;
  const stateLabel = { active: tn.stateActive, suspended: tn.stateSuspended };

  const columns: DataColumn<TenantRow>[] = [
    {
      id: "name", header: tn.displayName, primary: true,
      sort: { href: href({ dir: f.dir === "asc" ? "desc" : "asc" }), direction: f.dir },
      cell: (r) => (
        <Link href={`/tenants/${r.id}`} className="rounded-sm font-bold hover:underline" dir="auto">{r.display_name}</Link>
      ),
    },
    { id: "subdomain", header: tn.subdomain, label: tn.subdomain, cell: (r) => <LtrText>{r.subdomain}</LtrText> },
    {
      id: "state", header: t.admin.common.state, label: t.admin.common.state,
      cell: (r) => <StatusBadge tone={r.state === "active" ? "success" : "warning"} dot>{stateLabel[r.state]}</StatusBadge>,
    },
    { id: "created", header: t.admin.common.created, label: t.admin.common.created, className: "md:whitespace-nowrap", cell: (r) => formatDate(r.created_at, locale) },
  ];

  return (
    <PageContainer labelledBy="tenants-title">
      <PageHeader titleId="tenants-title" title={tn.title} description={tn.intro} actions={create} link={Link} />
      <FilterBar
        action="/tenants" label={tn.filters} submitLabel={tn.apply} link={Link}
        keep={{ dir: f.dir === "desc" ? "desc" : null }} clear={filtered ? { href: href({ q: null, state: null }), label: tn.clear } : undefined}
      >
        <FilterSearch id="tenants-q" name="q" label={tn.search} placeholder={tn.searchPlaceholder} defaultValue={f.q} maxLength={100} />
        <FilterMenu label={t.admin.common.state} value={f.state ? stateLabel[f.state] : tn.allStates} active={f.state !== null}>
          <FilterOption type="radio" name="state" value="" label={tn.allStates} defaultChecked={f.state === null} />
          {(["active", "suspended"] as const).map((v) => (
            <FilterOption
              key={v} type="radio" name="state" value={v} label={stateLabel[v]} defaultChecked={f.state === v}
              count={all.filter((r) => r.state === v).length}
            />
          ))}
        </FilterMenu>
      </FilterBar>
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id} caption={tn.title} link={Link}
        footer={<p className="text-xs text-subtle">{tn.count.replace("{count}", String(rows.length))}</p>}
        empty={filtered ? (
          <EmptyState
            icon={<SearchX />} title={tn.emptyFiltered}
            action={<Link href={href({ q: null, state: null })} className={buttonVariants({ variant: "outline" })}>{tn.clear}</Link>}
          />
        ) : <EmptyState icon={<Building2 />} title={tn.empty} action={create} />}
      />
    </PageContainer>
  );
}
