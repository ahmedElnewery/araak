import { Archive, KeyRound, Plus } from "lucide-react";
import Link from "next/link";
import { can, grantsToSwitches } from "@workspace/authorization";
import { buttonVariants } from "@workspace/ui/components/button";
import { EmptyState } from "@workspace/ui/components/empty-state";
import { ListCard, ListCardItem } from "@workspace/ui/components/list-card";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { RouteTabs } from "@workspace/ui/components/route-tabs";
import { settingsCrumb } from "@/lib/breadcrumbs";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { RoleActions } from "./role-actions";

export type RoleRow = {
  id: string; name: string; description: string | null; archivedAt: string | null; assignedCount: number;
  heldByActor: boolean; canGrant: boolean; grants: { key: string; scope: string; auditCategories: string[] | null }[];
};

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePermission("roles.view");
  const { tab } = await searchParams;
  const archivedTab = tab === "archived";
  const { t } = await getI18n();
  const r = t.portal.roles;
  const { data } = await ctx.supabase.rpc("list_roles");
  const all = (data ?? []) as RoleRow[];
  const rows = all.filter((x) => (x.archivedAt !== null) === archivedTab);
  const archivedCount = all.filter((x) => x.archivedAt !== null).length;
  const newRole = can(ctx.permissions, "roles.create") ? (
    <Link href="/settings/roles/new" className={buttonVariants({ className: "h-10 rounded-[10px]" })}>
      <Plus aria-hidden="true" />
      {r.new}
    </Link>
  ) : null;
  return (
    <PageContainer labelledBy="roles-title">
      <PageHeader
        titleId="roles-title" title={r.title} description={r.intro} actions={newRole} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [settingsCrumb(ctx.permissions, t), { label: r.title }] }}
      />
      <RouteTabs
        label={r.tabsLabel}
        link={Link}
        tabs={[
          { href: "/settings/roles", label: r.tabActive, count: all.length - archivedCount, active: !archivedTab },
          { href: "/settings/roles?tab=archived", label: r.tabArchived, count: archivedCount, active: archivedTab },
        ]}
      />
      {rows.length === 0 ? (
        archivedTab ? <EmptyState icon={<Archive />} title={r.emptyArchived} /> : (
          <EmptyState icon={<KeyRound />} title={r.empty} description={r.intro} action={newRole} />
        )
      ) : (
        <ListCard label={archivedTab ? r.tabArchived : r.title}>
          {rows.map((x) => {
            const { on } = grantsToSwitches(x.grants);
            return (
              <ListCardItem
                key={x.id}
                data-testid="role-row"
                icon={<KeyRound />}
                title={<span dir="auto">{x.name}</span>}
                href={`/settings/roles/${x.id}`}
                link={Link}
                meta={`${r.members}: ${String(x.assignedCount)}${on.length > 0 ? ` · ${on.map((s) => r.switches[s]).join("، ")}` : ""}`}
                actions={
                  <RoleActions
                    roleId={x.id} archived={x.archivedAt !== null} canArchive={can(ctx.permissions, "roles.archive")}
                    canRestore={can(ctx.permissions, "roles.restore")} t={t}
                  />
                }
              />
            );
          })}
        </ListCard>
      )}
    </PageContainer>
  );
}
