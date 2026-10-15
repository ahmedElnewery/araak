"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { inviteStaffAction } from "@/features/staff/invite-action";
import { initialFormState, type FormState } from "@/features/form-state";

export function InviteForm({ roles, t }: { roles: { id: string; name: string }[]; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteStaffAction, initialFormState);
  const f = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">{t.portal.staff.email}</Label>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="off" required />
        {f.email ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.email]}</p> : null}
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t.portal.staff.roles}</legend>
        {roles.length === 0 ? <p className="text-sm text-muted-foreground">{t.portal.staff.noRoles}</p> : null}
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="roles" value={r.id} className="size-4" />
            <span dir="auto">{r.name}</span>
          </label>
        ))}
        {f.roles ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.roles]}</p> : null}
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      {state.ok && !state.notice ? <p role="status" className="text-sm">{t.portal.staff.invited}</p> : null}
      {state.notice === "invitation_not_delivered" ? <p role="alert" className="text-sm text-destructive">{t.portal.staff.invitationNotDelivered}</p> : null}
      <Button type="submit" disabled={pending}>{t.portal.staff.send}</Button>
    </form>
  );
}
