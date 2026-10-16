"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { SettingsFooter, SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { initialFormState, type FormState } from "@/features/form-state";
import { invitePlatformAdminAction } from "@/features/platform-admins/invite-action";

type Props = { t: Dictionary["admin"]; capabilities: (keyof Dictionary["admin"]["capabilities"])[] };

export function InviteForm({ t, capabilities }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(invitePlatformAdminAction, initialFormState);
  const emailError = state.fieldErrors?.email;
  const capError = state.fieldErrors?.capabilities;
  return (
    <form action={action} className={settingsCard}>
      <SettingsSections>
        <SettingsSection id="invite-email" title={t.auth.email} description={t.admins.emailIntro}>
          <div className="grid gap-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" name="email" type="email" dir="ltr" required autoComplete="off" aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? "email-error" : undefined} />
            {emailError ? <p id="email-error" role="alert" className="text-sm text-destructive">{t.errors[emailError]}</p> : null}
          </div>
        </SettingsSection>
        <SettingsSection id="invite-capabilities" title={t.admins.capabilities} description={t.admins.capabilitiesIntro}>
          <fieldset className="space-y-2" aria-describedby={capError ? "capabilities-error" : undefined}>
            <legend className="sr-only">{t.admins.capabilities}</legend>
            {capabilities.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <Checkbox id={`cap-${c}`} name="capabilities" value={c} />
                <Label htmlFor={`cap-${c}`}>{t.capabilities[c]}</Label>
              </div>
            ))}
            {capError ? <p id="capabilities-error" role="alert" className="text-sm text-destructive">{t.errors[capError]}</p> : null}
          </fieldset>
        </SettingsSection>
      </SettingsSections>
      <SettingsFooter>
        {state.error ? <p role="alert" className="text-sm text-destructive">{t.errors[state.error]}</p> : null}
        {state.ok ? <p role="status" className="text-sm">{state.notice ? t.admins.invitationNotDelivered : t.admins.invitationSent}</p> : null}
        <Button type="submit" loading={pending}>{t.admins.sendInvitation}</Button>
      </SettingsFooter>
    </form>
  );
}
