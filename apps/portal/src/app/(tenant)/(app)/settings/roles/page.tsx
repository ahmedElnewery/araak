import Link from "next/link";
import { can } from "@workspace/authorization";
import { Button } from "@workspace/ui/components/button";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { RoleActions } from "./role-actions";
import { grantsToSwitches } from "@workspace/authorization";

export type RoleRow = {
  id: string; name: string; description: string | null; archivedAt: string | null; assignedCount: number;
  heldByActor: boolean; canGrant: boolean; grants: { key: string; scope: string; auditCategories: string[] | null }[];
};

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePermission("roles.view");
  const { tab } = await searchParams;
  const archivedTab = tab === "archived";
  const { t } = await getI18n();
  const { data } = await ctx.supabase.rpc("list_roles");
  const rows = ((data ?? []) as RoleRow[]).filter((r) => (r.archivedAt !== null) === archivedTab);
  const canCreate = can(ctx.permissions, "roles.create");
  const tabClass = (active: boolean) => `rounded-md px-3 py-1 text-sm ${active ? "bg-muted font-medium" : "underline"}`;
  return (
    <section className="space-y-6" aria-labelledby="roles-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="roles-title" className="text-xl font-semibold">{t.portal.roles.title}</h1>
        {canCreate ? <Button asChild><Link href="/settings/roles/new">{t.portal.roles.new}</Link></Button> : null}
      </div>
      <p className="text-sm text-muted-foreground">{t.portal.roles.intro}</p>
      <nav aria-label={t.portal.roles.title} className="flex gap-2">
        <Link href="/settings/roles" aria-current={archivedTab ? undefined : "page"} className={tabClass(!archivedTab)}>{t.portal.roles.tabActive}</Link>
        <Link href="/settings/roles?tab=archived" aria-current={archivedTab ? "page" : undefined} className={tabClass(archivedTab)}>{t.portal.roles.tabArchived}</Link>
      </nav>
      {rows.length === 0 ? <p className="text-muted-foreground">{archivedTab ? t.portal.roles.emptyArchived : t.portal.roles.empty}</p> : (
        <ul className="divide-y rounded-md border">
          {rows.map((r) => {
            const { on } = grantsToSwitches(r.grants);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid="role-row">
                <div className="space-y-1">
                  <Link href={`/settings/roles/${r.id}`} className="font-medium underline" dir="auto">{r.name}</Link>
                  <p className="text-xs text-muted-foreground">
                    {t.portal.roles.members}: {r.assignedCount}
                    {on.length > 0 ? ` · ${on.map((s) => t.portal.roles.switches[s]).join("، ")}` : ""}
                  </p>
                </div>
                <RoleActions roleId={r.id} archived={r.archivedAt !== null} canArchive={can(ctx.permissions, "roles.archive")}
                  canRestore={can(ctx.permissions, "roles.restore")} t={t} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
