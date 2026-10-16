import { SearchX, Users } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@workspace/ui/components/avatar";
import { buttonVariants } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { EmptyState } from "@workspace/ui/components/empty-state";
import { FilterBar, FilterMenu, FilterOption, FilterSearch } from "@workspace/ui/components/filter-bar";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { PageContainer } from "@workspace/ui/components/page-header";
import { StaffName } from "@workspace/ui/components/staff-name";
import { StatusBadge, Tag } from "@workspace/ui/components/status-badge";
import { initials } from "@workspace/ui/lib/initials";
import type { SearchParams } from "@/features/audit/filters";
import { applyStaffFilters, parseStaffFilters, staffQuery, type DirectoryRow, type StaffFilters } from "@/features/staff/directory";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { StaffHeader, STAFF_TITLE_ID } from "./staff-header";

// The list is small (one organization's staff) and comes back whole and authorized; search, state and order are
// query parameters applied here, so a filtered directory is a plain URL.
export default async function StaffDirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission("staff.view");
  const f = parseStaffFilters(await searchParams);
  const { locale, t } = await getI18n();
  const s = t.portal.staff;
  const [{ data }, { data: pending }] = await Promise.all([ctx.supabase.rpc("list_staff"), ctx.supabase.rpc("list_pending_invitations")]);
  const all = (data ?? []) as DirectoryRow[];
  const rows = applyStaffFilters(all, f, locale);
  const href = (o: Partial<StaffFilters>) => `/settings/staff${staffQuery(f, o)}`;
  const filtered = f.q !== null || f.state !== null;
  const clear = { href: href({ q: null, state: null }), label: s.clear };
  const stateLabel = { enabled: s.stateEnabled, disabled: s.stateDisabled };

  const columns: DataColumn<DirectoryRow>[] = [
    {
      id: "name", header: s.colName, primary: true,
      sort: { href: href({ dir: f.dir === "asc" ? "desc" : "asc" }), direction: f.dir },
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar initials={initials(r.firstName, r.lastName, r.username)} shape="circle" muted={!r.enabled} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Link href={`/settings/staff/${r.id}`} className="rounded-sm font-bold hover:underline"><StaffName staff={r} /></Link>
              {r.isManager ? <StatusBadge tone="accent">{s.managerBadge}</StatusBadge> : null}
            </div>
            {/* the username is what the person signs in with; StaffName already shows it while there is no name */}
            {r.firstName && r.lastName ? <div className="text-xs text-subtle"><LtrText>{r.username}</LtrText></div> : null}
          </div>
        </div>
      ),
    },
    {
      id: "roles", header: s.colRoles, label: s.colRoles,
      cell: (r) => r.roles.length ? (
        <div className="flex flex-wrap gap-1.5">{r.roles.map((x) => <Tag key={x.id}>{x.name}</Tag>)}</div>
      ) : <span className="text-subtle">{s.noRolesAssigned}</span>,
    },
    {
      id: "state", header: s.colState, label: s.colState,
      cell: (r) => <StatusBadge tone={r.enabled ? "success" : "neutral"} dot>{r.enabled ? s.stateEnabled : s.stateDisabled}</StatusBadge>,
    },
  ];

  return (
    <PageContainer labelledBy={STAFF_TITLE_ID}>
      <StaffHeader perms={ctx.permissions} t={t} active="staff" counts={{ staff: all.length, invitations: (pending as unknown[] | null)?.length }} />
      <FilterBar
        action="/settings/staff" label={s.filters} submitLabel={s.apply} link={Link}
        keep={{ dir: f.dir === "desc" ? "desc" : null }} clear={filtered ? clear : undefined}
      >
        <FilterSearch id="staff-q" name="q" label={s.search} placeholder={s.searchPlaceholder} defaultValue={f.q} maxLength={100} />
        <FilterMenu label={s.colState} value={f.state ? stateLabel[f.state] : s.allStates} active={f.state !== null}>
          <FilterOption type="radio" name="state" value="" label={s.allStates} defaultChecked={f.state === null} />
          {(["enabled", "disabled"] as const).map((v) => (
            <FilterOption
              key={v} type="radio" name="state" value={v} label={stateLabel[v]} defaultChecked={f.state === v}
              count={all.filter((r) => r.enabled === (v === "enabled")).length}
            />
          ))}
        </FilterMenu>
      </FilterBar>
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id} caption={s.directoryTitle} link={Link}
        rowProps={() => ({ "data-testid": "staff-row" })}
        footer={<p className="text-xs text-subtle">{s.count.replace("{count}", String(rows.length))}</p>}
        empty={filtered ? (
          <EmptyState
            icon={<SearchX />} title={s.emptyFiltered}
            action={<Link href={clear.href} className={buttonVariants({ variant: "outline" })}>{s.clear}</Link>}
          />
        ) : <EmptyState icon={<Users />} title={s.noStaff} />}
      />
    </PageContainer>
  );
}
