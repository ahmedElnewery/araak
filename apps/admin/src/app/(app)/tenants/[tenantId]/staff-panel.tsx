"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { initialFormState, type FormState } from "@/features/form-state";
import { platformResetStaffAction } from "@/features/tenants/staff-reset-action";

export type StaffRow = { staffId: string; username: string; email: string; enabled: boolean; isManager: boolean };

type Props = { tenantId: string; staff: StaffRow[]; t: Dictionary["admin"] };

/** `tenants.staff.manage`: the platform-assisted password reset (T121, CL-015). Account metadata only. */
export function StaffPanel({ tenantId, staff, t }: Props) {
  return (
    <section aria-labelledby="staff" className="space-y-4">
      <div className="space-y-1">
        <h2 id="staff" className="text-lg font-medium">{t.staff.title}</h2>
        <p className="text-sm text-muted-foreground">{t.staff.intro}</p>
      </div>
      {staff.length === 0 ? (
        <p className="text-muted-foreground">{t.staff.none}</p>
      ) : (
        <Table data-testid="tenant-staff">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t.staff.username}</TableHead>
              <TableHead scope="col">{t.staff.email}</TableHead>
              <TableHead scope="col">{t.staff.status}</TableHead>
              <TableHead scope="col"><span className="sr-only">{t.common.actions}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.staffId}>
                <TableCell><LtrText>{s.username}</LtrText></TableCell>
                <TableCell><LtrText>{s.email}</LtrText></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={s.enabled ? "default" : "secondary"}>{s.enabled ? t.staff.enabled : t.staff.disabled}</Badge>
                    {s.isManager ? <Badge variant="outline">{t.staff.manager}</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>{s.enabled ? <ResetDialog tenantId={tenantId} staffId={s.staffId} t={t} /> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** Asks for the PLATFORM ADMIN's own password only. The employee alone chooses the new password. */
function ResetDialog({ tenantId, staffId, t }: { tenantId: string; staffId: string; t: Dictionary["admin"] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(platformResetStaffAction.bind(null, tenantId, staffId), initialFormState);
  const confirmError = state.fieldErrors?.adminPassword;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">{t.staff.resetPassword}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.staff.resetTitle}</DialogTitle>
          <DialogDescription>{t.staff.resetIntro}</DialogDescription>
        </DialogHeader>
        {state.ok ? (
          <p role="status">{state.notice ? t.staff.resetNotDelivered : t.staff.resetSent}</p>
        ) : (
          <form action={action} className="space-y-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor={`adminPassword-${staffId}`}>{t.staff.adminPassword}</Label>
              <Input id={`adminPassword-${staffId}`} name="adminPassword" type="password" autoComplete="current-password" dir="ltr" required />
              {confirmError ? <p role="alert" className="text-sm text-destructive">{t.errors[confirmError]}</p> : null}
            </div>
            {state.error ? <p role="alert" className="text-sm text-destructive">{t.errors[state.error]}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{t.staff.confirmReset}</Button>
              <Button type="button" variant="outline" onClick={() => {
                setOpen(false);
              }}>{t.common.cancel}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
