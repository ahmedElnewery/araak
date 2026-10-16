import { exportSecurityCsv } from "@/features/audit/actions";
import { csvResponse } from "@/features/audit/csv";
import { parseSecurityFilters, searchParamsOf } from "@/features/audit/filters";
import { exportFilename } from "@/features/audit/present";
import { requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";

// CSV export of the Security Log (CL-035): the active tenant manager only, checked here and again by the database.
export async function GET(request: Request) {
  const ctx = await requireManager();
  const { t } = await getI18n();
  const { body, truncated } = await exportSecurityCsv(ctx, parseSecurityFilters(searchParamsOf(new URL(request.url))), t.portal);
  const res = csvResponse(body, exportFilename("security-log"));
  if (truncated) res.headers.set("X-Export-Truncated", "true");
  return res;
}
