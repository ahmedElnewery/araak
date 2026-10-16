"use client";

import { useState, useTransition } from "react";
import { formatDateTime, type Dictionary, type Locale } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { LtrText } from "@workspace/ui/components/ltr-text";
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
  if (rows.length === 0) return <p className="text-muted-foreground">{t.portal.staff.pendingEmpty}</p>;
  return (
    <div className="space-y-3">
      <table className="w-full text-start text-sm">
        <thead>
          <tr className="border-b text-start">
            <th scope="col" className="p-2 text-start">{t.portal.staff.colEmail}</th>
            <th scope="col" className="p-2 text-start">{t.portal.staff.colRoles}</th>
            <th scope="col" className="p-2 text-start">{t.portal.staff.colExpires}</th>
            <th scope="col" className="p-2 text-start">{t.portal.staff.colStatus}</th>
            {canResend ? <th scope="col" className="p-2 text-start"><span className="sr-only">{t.portal.staff.resend}</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.invitationId} className="border-b" data-testid="pending-invitation">
              <td className="p-2"><LtrText>{r.email}</LtrText></td>
              <td className="p-2"><span dir="auto">{r.roles.join(", ")}</span></td>
              <td className="p-2">{formatDateTime(r.expiresAt, locale, timeZone)}</td>
              <td className="p-2">{r.expired ? t.portal.staff.statusExpired : t.portal.staff.statusPending}</td>
              {canResend ? (
                <td className="p-2">
                  <Button
                    size="sm" variant="outline" disabled={!r.canResend} loading={pending && r.canResend}
                    aria-describedby={r.canResend ? undefined : `next-${r.invitationId}`}
                    onClick={() => {
                      start(async () => {
                        setResult({ id: r.invitationId, state: await resendInvitationAction(r.invitationId) });
                      });
                    }}
                  >
                    {t.portal.staff.resend}
                  </Button>
                  {!r.canResend ? (
                    <p id={`next-${r.invitationId}`} className="mt-1 text-xs text-muted-foreground">
                      {t.portal.staff.resendAvailableAt} {formatDateTime(r.nextResendAt, locale, timeZone)}
                    </p>
                  ) : null}
                  {result?.id === r.invitationId && result.state.error ? <p role="alert" className="text-xs text-destructive">{t.portal.errors[result.state.error]}</p> : null}
                  {result?.id === r.invitationId && result.state.ok ? (
                    <p role="status" className="text-xs">{result.state.notice ? t.portal.staff.invitationNotDelivered : t.portal.staff.resent}</p>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
