import Link from "next/link";
import { formatDate } from "@workspace/i18n";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { getI18n } from "@/lib/locale";
import { TENANT_CAPABILITIES, requirePlatformAdminAny } from "@/lib/platform-guards";

export default async function TenantsPage() {
  const ctx = await requirePlatformAdminAny(TENANT_CAPABILITIES);
  const { locale, t } = await getI18n();
  // Metadata only: no tenant-private data is ever listed here (FR-029).
  const { data } = await ctx.supabase.rpc("platform_list_tenants");
  const rows = data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t.admin.tenants.title}</h1>
        {ctx.capabilities.includes("tenants.manage") ? (
          <Link href="/tenants/new" className={buttonVariants()}>
            {t.admin.tenants.new}
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t.admin.tenants.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.tenants.displayName}</TableHead>
              <TableHead>{t.admin.tenants.subdomain}</TableHead>
              <TableHead>{t.admin.common.state}</TableHead>
              <TableHead>{t.admin.common.created}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/tenants/${r.id}`} className="font-medium underline-offset-4 hover:underline" dir="auto">
                    {r.display_name}
                  </Link>
                </TableCell>
                <TableCell>
                  <LtrText>{r.subdomain}</LtrText>
                </TableCell>
                <TableCell>
                  <Badge variant={r.state === "active" ? "default" : "secondary"}>
                    {r.state === "active" ? t.admin.tenants.stateActive : t.admin.tenants.stateSuspended}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(r.created_at, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
