import { exportAuditCsv } from "@/features/audit/actions";
import { csvResponse } from "@/features/audit/csv";
import { parseAuditFilters, searchParamsOf } from "@/features/audit/filters";
import { exportFilename } from "@/features/audit/present";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

// CSV export of the tenant audit (FR-031). Authorized again at request time, so a viewer whose permission was removed
// after the list loaded is denied (and the denial recorded); the database applies the categories once more.
export async function GET(request: Request) {
  const ctx = await requirePermission("audit_logs.view");
  const { t } = await getI18n();
  const { body, truncated } = await exportAuditCsv(ctx, parseAuditFilters(searchParamsOf(new URL(request.url))), t.portal.audit);
  const res = csvResponse(body, exportFilename("audit-log"));
  if (truncated) res.headers.set("X-Export-Truncated", "true");
  return res;
}
