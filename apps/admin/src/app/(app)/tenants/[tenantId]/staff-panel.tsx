"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { SettingsSection } from "@workspace/ui/components/settings-section";
import { StaffName } from "@workspace/ui/components/staff-name";
import { StatusBadge, Tag } from "@workspace/ui/components/status-badge";
import { initialFormState, type FormState } from "@/features/form-state";
import { platformResetStaffAction } from "@/features/tenants/staff-reset-action";

export type StaffRow = {
  staffId: string; username: string; firstName: string | null; lastName: string | null; email: string; enabled: boolean; isManager: boolean;
};

type Props = { tenantId: string; staff: StaffRow[]; t: Dictionary["admin"] };

/** `tenants.staff.manage`: the platform-assisted password reset (T121, CL-015). Account metadata only. */
export function StaffPanel({ tenantId, staff, t }: Props) {
  const columns: DataColumn<StaffRow>[] = [
    { id: "name", header: t.staff.name, primary: true, cell: (s) => <StaffName staff={s} /> },
    { id: "email", header: t.staff.email, label: t.staff.email, cell: (s) => <LtrText>{s.email}</LtrText> },
    {
      id: "status", header: t.staff.status, label: t.staff.status,
      cell: (s) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={s.enabled ? "success" : "neutral"} dot>{s.enabled ? t.staff.enabled : t.staff.disabled}</StatusBadge>
          {s.isManager ? <Tag>{t.staff.manager}</Tag> : null}
        </div>
      ),
    },
    {
      id: "actions", header: t.common.actions, srOnlyHeader: true, align: "end",
      cell: (s) => (s.enabled ? <ResetDialog tenantId={tenantId} staffId={s.staffId} t={t} /> : null),
    },
  ];
  return (
    <SettingsSection id="staff" title={t.staff.title} description={t.staff.intro}>
      {staff.length === 0 ? <p className="text-sm text-muted-foreground">{t.staff.none}</p> : (
        <div data-testid="tenant-staff">
          <DataTable columns={columns} rows={staff} rowKey={(s) => s.staffId} caption={t.staff.title} />
        </div>
      )}
    </SettingsSection>
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
              <Button type="submit" loading={pending}>{t.staff.confirmReset}</Button>
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
