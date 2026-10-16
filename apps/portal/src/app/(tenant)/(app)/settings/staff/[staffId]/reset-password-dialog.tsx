"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { initialFormState, type FormState } from "@/features/form-state";
import { managerResetAction } from "@/features/staff/manager-reset-action";

/** Asks for the MANAGER's own current password only. The employee alone chooses the new password (CL-015). */
export function ResetPasswordDialog({ staffId, t }: { staffId: string; t: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(managerResetAction.bind(null, staffId), initialFormState);
  const confirmError = state.fieldErrors?.managerPassword;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">{t.portal.staff.resetPassword}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.portal.staff.resetTitle}</DialogTitle>
          <DialogDescription>{t.portal.staff.resetIntro}</DialogDescription>
        </DialogHeader>
        {state.ok ? (
          <p role="status">{state.notice ? t.portal.staff.resetNotDelivered : t.portal.staff.resetSent}</p>
        ) : (
          <form action={action} className="space-y-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="managerPassword">{t.portal.staff.managerPassword}</Label>
              <Input id="managerPassword" name="managerPassword" type="password" autoComplete="current-password" dir="ltr" required />
              {confirmError ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[confirmError]}</p> : null}
            </div>
            {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>{t.portal.staff.confirmReset}</Button>
              <Button type="button" variant="outline" onClick={() => {
                setOpen(false);
              }}>{t.portal.staff.cancel}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
