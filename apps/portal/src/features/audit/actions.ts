import "server-only";
import { redirect } from "next/navigation";
import type { AuditCategory } from "@workspace/authorization";
import type { Dictionary } from "@workspace/i18n";
import type { TenantStaffContext } from "@workspace/auth/server";
import { toCsv } from "./csv";
import {
  auditRpcFilters, pageArgs, securityRpcFilters, type AuditFilters, type SecurityFilters,
} from "./filters";
import { actorText, label, type AuditRow, type Page, type SecurityRow } from "./present";

// Data access for the audit viewer, the Security Logs and their exports. The page or route has already passed its
// guard; the database re-checks the same authority on every call (categories, manager status, tenant, session), so a
// permission lost between the guard and the query still reads nothing.

type Ctx = Pick<TenantStaffContext, "supabase">;
type RpcError = { code?: string; message: string } | null;

function failed(error: NonNullable<RpcError>): never {
  if (error.code === "42501") redirect("/forbidden");
  throw new Error("audit_unavailable");
}

export async function loadAuditPage(ctx: Ctx, f: AuditFilters): Promise<Page<AuditRow> & { categories: AuditCategory[] }> {
  const { data, error } = await ctx.supabase.rpc("list_tenant_audit", { ...auditRpcFilters(f), ...pageArgs(f) });
  if (error) failed(error);
  return data as unknown as Page<AuditRow> & { categories: AuditCategory[] };
}

/** Null for an id the viewer may not see (another tenant, category or log): all look the same. */
export async function loadAuditEvent(ctx: Ctx, id: number): Promise<AuditRow | null> {
  const { data, error } = await ctx.supabase.rpc("get_tenant_audit_event", { p_id: id });
  if (error?.message === "event_not_found") return null;
  if (error) failed(error);
  return data as unknown as AuditRow;
}

export async function loadSecurityPage(ctx: Ctx, f: SecurityFilters): Promise<Page<SecurityRow>> {
  const { data, error } = await ctx.supabase.rpc("list_security_events", { ...securityRpcFilters(f), ...pageArgs(f) });
  if (error) failed(error);
  return data as unknown as Page<SecurityRow>;
}

export async function loadSecurityEvent(ctx: Ctx, id: number): Promise<SecurityRow | null> {
  const { data, error } = await ctx.supabase.rpc("get_security_event", { p_id: id });
  if (error?.message === "event_not_found") return null;
  if (error) failed(error);
  return data as unknown as SecurityRow;
}

type Export<T> = { rows: T[]; truncated: boolean };
const details = (m: Record<string, unknown>) => (Object.keys(m).length > 0 ? JSON.stringify(m) : "");

/** CSV of the filtered tenant audit, safe columns only (no email, no platform identity). The export is audited. */
export async function exportAuditCsv(ctx: Ctx, f: AuditFilters, t: Dictionary["portal"]["audit"]) {
  const { data, error } = await ctx.supabase.rpc("export_tenant_audit", auditRpcFilters(f));
  if (error) failed(error);
  const { rows, truncated } = data as unknown as Export<AuditRow>;
  const body = toCsv([
    [t.colTime, t.colCategory, t.colEvent, t.eventCode, t.colActor, t.colResource, t.colDetails],
    ...rows.map((r) => [
      r.occurredAt, t.categories[r.category], label(t.events, r.event), r.event, actorText(r, t), r.resourceId ?? "", details(r.metadata),
    ]),
  ]);
  return { body, truncated };
}

export async function exportSecurityCsv(ctx: Ctx, f: SecurityFilters, t: Dictionary["portal"]) {
  const { data, error } = await ctx.supabase.rpc("export_security_events", securityRpcFilters(f));
  if (error) failed(error);
  const { rows, truncated } = data as unknown as Export<SecurityRow>;
  const a = t.audit;
  const body = toCsv([
    [a.colTime, a.colEvent, a.eventCode, a.colActor, a.colDetails],
    ...rows.map((r) => [r.occurredAt, label(t.securityLogs.events, r.event), r.event, actorText(r, a), details(r.metadata)]),
  ]);
  return { body, truncated };
}
