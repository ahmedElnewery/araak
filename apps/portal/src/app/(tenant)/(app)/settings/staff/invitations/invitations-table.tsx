"use client";

import { MailCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { formatDateTime, type Dictionary, type Locale } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { EmptyState } from "@workspace/ui/components/empty-state";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { StatusBadge, Tag } from "@workspace/ui/components/status-badge";
import { useTimeZone } from "@workspace/ui/hooks/use-time-zone";
import { resendInvitationAction } from "@/features/invitations/resend-action";
import type { FormState } from "@/features/form-state";

export type PendingInvitation = {
  invitationId: string; email: string; roles: string[]; issuedAt: string; expiresAt: string; expired: boolean;
  nextResendAt: string; canResend: boolean;
};

// There is deliberately NO cancel control (FR-009, CL-020). Resend is manager-only and disabled until allowed.
export function InvitationsTable({ rows, canResend, t, locale }: { rows: PendingInvitation[]; canResend: boolean; t: Dictionary; locale: Locale }) {
  const [result, setResult] = useState<{ id: string; state: FormState } | null>(null);
  const [pending, start] = useTransition();
  const timeZone = useTimeZone();
  const s = t.portal.staff;
  const columns: DataColumn<PendingInvitation>[] = [
    { id: "email", header: s.colEmail, primary: true, cell: (r) => <LtrText className="font-bold">{r.email}</LtrText> },
    {
      id: "roles", header: s.colRoles, label: s.colRoles,
      cell: (r) => r.roles.length ? (
        <div className="flex flex-wrap gap-1.5">{r.roles.map((name) => <Tag key={name}>{name}</Tag>)}</div>
      ) : <span className="text-subtle">{s.noRolesAssigned}</span>,
    },
    { id: "expires", header: s.colExpires, label: s.colExpires, cell: (r) => formatDateTime(r.expiresAt, locale, timeZone) },
    {
      id: "status", header: s.colStatus, label: s.colStatus,
      cell: (r) => <StatusBadge tone={r.expired ? "neutral" : "warning"} dot>{r.expired ? s.statusExpired : s.statusPending}</StatusBadge>,
    },
    ...(canResend ? [{
      id: "resend", header: s.resend, srOnlyHeader: true, align: "end" as const,
      cell: (r: PendingInvitation) => (
        <div className="space-y-1 md:text-end">
          <Button
            size="sm" variant="outline" disabled={!r.canResend} loading={pending && r.canResend}
            aria-describedby={r.canResend ? undefined : `next-${r.invitationId}`}
            onClick={() => {
              start(async () => {
                setResult({ id: r.invitationId, state: await resendInvitationAction(r.invitationId) });
              });
            }}
          >
            {s.resend}
          </Button>
          {!r.canResend ? (
            <p id={`next-${r.invitationId}`} className="text-xs text-muted-foreground">
              {s.resendAvailableAt} {formatDateTime(r.nextResendAt, locale, timeZone)}
            </p>
          ) : null}
          {result?.id === r.invitationId && result.state.error ? <p role="alert" className="text-xs text-destructive">{t.portal.errors[result.state.error]}</p> : null}
          {result?.id === r.invitationId && result.state.ok ? (
            <p role="status" className="text-xs">{result.state.notice ? s.invitationNotDelivered : s.resent}</p>
          ) : null}
        </div>
      ),
    }] : []),
  ];
  return (
    <DataTable
      columns={columns} rows={rows} rowKey={(r) => r.invitationId} caption={s.pendingTitle}
      rowProps={() => ({ "data-testid": "pending-invitation" })}
      empty={<EmptyState icon={<MailCheck />} title={s.pendingEmpty} description={s.pendingEmptyHint} />}
    />
  );
}
