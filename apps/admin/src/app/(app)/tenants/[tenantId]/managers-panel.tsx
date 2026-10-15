"use client";

import { useActionState, useState, useTransition } from "react";
import { formatDateTime, type Dictionary, type Locale } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { useTimeZone } from "@workspace/ui/hooks/use-time-zone";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { initialFormState, type FormState } from "@/features/form-state";
import { inviteManager, promoteManager, revokeManager } from "@/features/managers/actions";
import type { ErrorCode } from "@/lib/rpc-error";

export type ManagersData = {
  active: { staffId: string; username: string; email: string; enabled: boolean }[];
  pending: { invitationId: string; email: string; expiresAt: string | null }[];
  eligible: { staffId: string; username: string; email: string }[];
};

type Props = { tenantId: string; data: ManagersData; t: Dictionary["admin"]; locale: Locale };

export function ManagersPanel({ tenantId, data, t, locale }: Props) {
  const [promoteState, promoteAction, promoting] = useActionState<FormState, FormData>(promoteManager.bind(null, tenantId), initialFormState);
  const [inviteState, inviteAction, inviting] = useActionState<FormState, FormData>(inviteManager.bind(null, tenantId), initialFormState);
  const [revokeError, setRevokeError] = useState<ErrorCode | undefined>();
  const [pending, start] = useTransition();
  const timeZone = useTimeZone();
  const err = (c: ErrorCode | undefined) => (c ? t.errors[c] : null);

  return (
    <section aria-labelledby="managers" className="space-y-6">
      <h2 id="managers" className="text-lg font-medium">{t.managers.title}</h2>

      <div className="space-y-2">
        <h3 className="font-medium">{t.managers.active}</h3>
        <ul data-testid="active-managers" className="divide-y rounded-md border">
          {data.active.length === 0 ? <li className="p-3 text-muted-foreground">{t.managers.none}</li> : null}
          {data.active.map((m) => (
            <li key={m.staffId} className="flex items-center justify-between gap-2 p-3">
              <span><LtrText>{m.username}</LtrText> (<LtrText>{m.email}</LtrText>)</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={pending}>{t.managers.revoke}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.managers.revokeTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{t.managers.revokeBody}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { start(async () => { setRevokeError((await revokeManager(tenantId, m.staffId)).error); }); }}>
                      {t.managers.confirmRevoke}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
        {revokeError ? <p role="alert" className="text-sm text-destructive">{err(revokeError)}</p> : null}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">{t.managers.pending}</h3>
        <ul data-testid="pending-manager-invitations" className="divide-y rounded-md border">
          {data.pending.length === 0 ? <li className="p-3 text-muted-foreground">{t.managers.none}</li> : null}
          {data.pending.map((p) => (
            <li key={p.invitationId} className="p-3">
              <LtrText>{p.email}</LtrText>
              {p.expiresAt ? <span className="text-sm text-muted-foreground"> · {t.managers.expires} {formatDateTime(p.expiresAt, locale, timeZone)}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      <form action={promoteAction} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="staffId">{t.managers.staffMember}</Label>
          <select id="staffId" name="staffId" required defaultValue="" className="h-9 min-w-64 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="" disabled>{t.managers.selectStaff}</option>
            {data.eligible.map((s) => (
              <option key={s.staffId} value={s.staffId}>{`${s.username} (${s.email})`}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={promoting || data.eligible.length === 0}>{t.managers.promote}</Button>
        {promoteState.error ? <p role="alert" className="w-full text-sm text-destructive">{err(promoteState.error)}</p> : null}
      </form>

      <form action={inviteAction} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="inviteEmail">{t.managers.inviteEmail}</Label>
          <Input id="inviteEmail" name="email" type="email" dir="ltr" required className="min-w-64" autoComplete="off" />
        </div>
        <Button type="submit" variant="outline" disabled={inviting}>{t.managers.invite}</Button>
        {inviteState.fieldErrors?.email ? <p role="alert" className="w-full text-sm text-destructive">{err(inviteState.fieldErrors.email)}</p> : null}
        {inviteState.error ? <p role="alert" className="w-full text-sm text-destructive">{err(inviteState.error)}</p> : null}
        {inviteState.ok ? <p role="status" className="w-full text-sm">{inviteState.notice ? t.tenants.invitationNotDelivered : t.managers.invited}</p> : null}
      </form>
    </section>
  );
}
