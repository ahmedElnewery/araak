"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import type { RoleSwitch } from "@workspace/authorization";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { SettingsFooter, SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { saveRoleAction } from "@/features/roles/actions";
import { initialFormState, type FormState } from "@/features/form-state";

type Props = {
  roleId: string | null; name: string; description: string; offered: RoleSwitch[]; on: RoleSwitch[];
  /** true when the actor holds this role: shown read-only with an explanation (CL-027) */
  readOnly: boolean; extra: boolean; t: Dictionary;
};

/** Four plain switches; scopes, ceiling text and raw permission keys are never shown. */
export function RoleForm({ roleId, name, description, offered, on, readOnly, extra, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRoleAction.bind(null, roleId), initialFormState);
  const r = t.portal.roles;
  // A switch the role already has but the actor could not grant stays visible (disabled). Disabled inputs are not
  // submitted, so the save action keeps that switch's stored grants unchanged instead of reading it as switched off.
  const shown = (["viewStaff", "manageStaff", "manageRoles", "viewAudit"] as const).filter((s) => offered.includes(s) || on.includes(s));
  const nameError = state.fieldErrors?.name;
  return (
    <form action={action} className={settingsCard} noValidate>
      {readOnly ? <p role="note" className="mb-6 rounded-lg bg-secondary p-3 text-sm">{r.heldNote}</p> : null}
      {extra && !readOnly ? <p role="note" className="mb-6 rounded-lg bg-secondary p-3 text-sm">{r.extraNote}</p> : null}
      <SettingsSections>
        <SettingsSection id="role-details" title={r.detailsTitle} description={r.detailsIntro}>
          <div className="grid gap-2">
            <Label htmlFor="name">{r.name}</Label>
            <Input id="name" name="name" defaultValue={name} maxLength={80} required readOnly={readOnly} dir="auto" aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? "name-error" : undefined} />
            {nameError ? <p id="name-error" role="alert" className="text-sm text-destructive">{t.portal.errors[nameError]}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">{r.description}</Label>
            <Input id="description" name="description" defaultValue={description} readOnly={readOnly} dir="auto" />
          </div>
        </SettingsSection>
        <SettingsSection id="role-permissions" title={r.permissionsTitle} description={r.permissions}>
          <fieldset className="grid gap-1" disabled={readOnly}>
            <legend className="sr-only">{r.permissions}</legend>
            {shown.length === 0 ? <p className="text-sm text-muted-foreground">{r.noSwitches}</p> : null}
            {shown.map((s) => (
              <div key={s} className="flex items-start gap-3 rounded-lg p-2 text-sm has-[:enabled]:hover:bg-hover">
                <input id={`switch-${s}`} type="checkbox" name="switches" value={s} defaultChecked={on.includes(s)} disabled={!offered.includes(s)} className="mt-0.5 size-4 shrink-0 accent-primary" />
                <label htmlFor={`switch-${s}`} className="min-w-0">
                  <span className="font-semibold">{r.switches[s]}</span>
                  <span className="block text-muted-foreground">{r.switchHints[s]}</span>
                </label>
              </div>
            ))}
          </fieldset>
        </SettingsSection>
      </SettingsSections>
      {readOnly ? null : (
        <SettingsFooter>
          {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
          {state.ok ? <p role="status" className="text-sm">{r.saved}</p> : null}
          <Button type="submit" loading={pending}>{r.save}</Button>
        </SettingsFooter>
      )}
    </form>
  );
}
