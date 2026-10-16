"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { SettingsFooter, SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { inviteStaffAction } from "@/features/staff/invite-action";
import { initialFormState, type FormState } from "@/features/form-state";

export function InviteForm({ roles, t }: { roles: { id: string; name: string }[]; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteStaffAction, initialFormState);
  const f = state.fieldErrors ?? {};
  const s = t.portal.staff;
  return (
    <form action={action} className={settingsCard} noValidate>
      <SettingsSections>
        <SettingsSection id="invite-email" title={s.email} description={s.emailIntro}>
          <div className="grid gap-2">
            <Label htmlFor="email">{s.email}</Label>
            <Input
              id="email" name="email" type="email" dir="ltr" autoComplete="off" required
              aria-invalid={f.email ? true : undefined} aria-describedby={f.email ? "email-error" : undefined}
            />
            {f.email ? <p id="email-error" role="alert" className="text-sm text-destructive">{t.portal.errors[f.email]}</p> : null}
          </div>
        </SettingsSection>
        <SettingsSection id="invite-roles" title={s.roles} description={s.rolesIntro}>
          <fieldset className="grid gap-1" aria-describedby={f.roles ? "roles-error" : undefined}>
            <legend className="sr-only">{s.roles}</legend>
            {roles.length === 0 ? <p className="text-sm text-muted-foreground">{s.noRoles}</p> : null}
            {roles.map((r) => (
              <label key={r.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-hover">
                <input type="checkbox" name="roles" value={r.id} className="size-4 shrink-0 accent-primary" />
                <span dir="auto">{r.name}</span>
              </label>
            ))}
            {f.roles ? <p id="roles-error" role="alert" className="text-sm text-destructive">{t.portal.errors[f.roles]}</p> : null}
          </fieldset>
        </SettingsSection>
      </SettingsSections>
      <SettingsFooter>
        {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
        {state.ok && !state.notice ? <p role="status" className="text-sm">{s.invited}</p> : null}
        {state.notice === "invitation_not_delivered" ? <p role="alert" className="text-sm text-destructive">{s.invitationNotDelivered}</p> : null}
        <Button type="submit" loading={pending}>{s.send}</Button>
      </SettingsFooter>
    </form>
  );
}
