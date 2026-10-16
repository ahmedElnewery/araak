import type { AuditCategory } from "@workspace/authorization";
import type { Dictionary } from "@workspace/i18n";
import { staffName } from "@workspace/ui/components/staff-name";

/** Shapes returned by the audit RPCs (supabase/migrations/*_audit_read_rpcs.sql). Metadata is already sanitized. */
export type AuditActor = { staffId: string; username: string; firstName: string | null; lastName: string | null };
export type AuditRow = {
  id: number; occurredAt: string; category: AuditCategory; event: string; actorKind: "staff" | "platform_admin" | "system";
  actor: AuditActor | null; resourceType: string | null; resourceId: string | null; metadata: Record<string, unknown>;
};
export type SecurityRow = { id: number; occurredAt: string; event: string; actor: AuditActor | null; metadata: Record<string, unknown> };
export type Page<T> = { rows: T[]; totalCount: number };

/** A known event's label, or its code. */
export function label(labels: Readonly<Record<string, string>>, code: string): string {
  return (labels as Record<string, string | undefined>)[code] ?? code;
}

/** Who did it, as the tenant may see it: a staff name, never a platform identity. */
export function actorText(row: { actor: AuditActor | null; actorKind?: AuditRow["actorKind"] }, t: Dictionary["portal"]["audit"]): string {
  if (row.actor) return staffName(row.actor);
  return row.actorKind === "platform_admin" ? t.actorPlatform : t.actorSystem;
}

/** Metadata as display pairs: scalars as text, nested values as compact JSON. */
export function metadataEntries(metadata: Record<string, unknown> | null | undefined): [string, string][] {
  return Object.entries(metadata ?? {}).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)]);
}

export function exportFilename(prefix: string, now = new Date()): string {
  return `${prefix}-${now.toISOString().slice(0, 10)}.csv`;
}
