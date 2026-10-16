"use client";

import { useActionState, useState, useTransition } from "react";
import { formatDateTime, type Dictionary, type Locale } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { ListCard, ListCardItem } from "@workspace/ui/components/list-card";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { SettingsSection } from "@workspace/ui/components/settings-section";
import { StaffName, staffName } from "@workspace/ui/components/staff-name";
import { useTimeZone } from "@workspace/ui/hooks/use-time-zone";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { initialFormState, type FormState } from "@/features/form-state";
import { inviteManager, promoteManager, revokeManager } from "@/features/managers/actions";
import type { ErrorCode } from "@/lib/rpc-error";

export type ManagersData = {
  active: { staffId: string; username: string; firstName: string | null; lastName: string | null; email: string; enabled: boolean }[];
  pending: { invitationId: string; email: string; expiresAt: string | null }[];
  eligible: { staffId: string; username: string; firstName: string | null; lastName: string | null; email: string }[];
};

type Props = { tenantId: string; data: ManagersData; t: Dictionary["admin"]; locale: Locale };

const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm";

export function ManagersPanel({ tenantId, data, t, locale }: Props) {
  const [promoteState, promoteAction, promoting] = useActionState<FormState, FormData>(promoteManager.bind(null, tenantId), initialFormState);
  const [inviteState, inviteAction, inviting] = useActionState<FormState, FormData>(inviteManager.bind(null, tenantId), initialFormState);
  const [revokeError, setRevokeError] = useState<ErrorCode | undefined>();
  const [pending, start] = useTransition();
  const timeZone = useTimeZone();
  const err = (c: ErrorCode | undefined) => (c ? t.errors[c] : null);

  return (
    <SettingsSection id="managers" title={t.managers.title} description={t.managers.intro}>
      <div className="space-y-2">
        <h3 className="text-sm font-extrabold">{t.managers.active}</h3>
        <div data-testid="active-managers">
          {data.active.length === 0 ? <p className="text-sm text-muted-foreground">{t.managers.none}</p> : (
            <ListCard label={t.managers.active}>
              {data.active.map((m) => (
                <ListCardItem
                  key={m.staffId}
                  title={<><StaffName staff={m} /> (<LtrText>{m.email}</LtrText>)</>}
                  actions={
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" loading={pending}>{t.managers.revoke}</Button>
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
                  }
                />
              ))}
            </ListCard>
          )}
        </div>
        {revokeError ? <p role="alert" className="text-sm text-destructive">{err(revokeError)}</p> : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-extrabold">{t.managers.pending}</h3>
        <div data-testid="pending-manager-invitations">
          {data.pending.length === 0 ? <p className="text-sm text-muted-foreground">{t.managers.none}</p> : (
            <ListCard label={t.managers.pending}>
              {data.pending.map((p) => (
                <ListCardItem
                  key={p.invitationId}
                  title={<LtrText>{p.email}</LtrText>}
                  meta={p.expiresAt ? <>{t.managers.expires} {formatDateTime(p.expiresAt, locale, timeZone)}</> : undefined}
                />
              ))}
            </ListCard>
          )}
        </div>
      </div>

      <form action={promoteAction} className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor="staffId">{t.managers.staffMember}</Label>
          <select id="staffId" name="staffId" required defaultValue="" className={selectClass}>
            <option value="" disabled>{t.managers.selectStaff}</option>
            {data.eligible.map((s) => (
              <option key={s.staffId} value={s.staffId}>{`${staffName(s)} (${s.email})`}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={data.eligible.length === 0} loading={promoting}>{t.managers.promote}</Button>
        {promoteState.error ? <p role="alert" className="w-full text-sm text-destructive">{err(promoteState.error)}</p> : null}
      </form>

      <form action={inviteAction} className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor="inviteEmail">{t.managers.inviteEmail}</Label>
          <Input id="inviteEmail" name="email" type="email" dir="ltr" required autoComplete="off" />
        </div>
        <Button type="submit" variant="outline" loading={inviting}>{t.managers.invite}</Button>
        {inviteState.fieldErrors?.email ? <p role="alert" className="w-full text-sm text-destructive">{err(inviteState.fieldErrors.email)}</p> : null}
        {inviteState.error ? <p role="alert" className="w-full text-sm text-destructive">{err(inviteState.error)}</p> : null}
        {inviteState.ok ? <p role="status" className="w-full text-sm">{inviteState.notice ? t.tenants.invitationNotDelivered : t.managers.invited}</p> : null}
      </form>
    </SettingsSection>
  );
}
