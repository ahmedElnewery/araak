"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { SettingsFooter, SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { saveBrandingAction } from "@/features/branding/actions";
import { initialFormState, type FormState } from "@/features/form-state";

type Props = { displayName: string; logoSrc: string | null; t: Dictionary };

export function BrandingForm({ displayName, logoSrc, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBrandingAction, initialFormState);
  const nameError = state.fieldErrors?.displayName;
  const logoError = state.fieldErrors?.logo;
  const b = t.portal.branding;
  return (
    <form action={action} className={settingsCard} noValidate>
      <SettingsSections>
        <SettingsSection id="branding-name" title={b.nameTitle} description={b.nameIntro}>
          <div className="grid gap-2">
            <Label htmlFor="displayName">{b.nameLabel}</Label>
            <Input
              id="displayName" name="displayName" defaultValue={displayName} required maxLength={80} dir="auto"
              aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? "displayName-error" : undefined}
            />
            {nameError ? <p id="displayName-error" role="alert" className="text-sm text-destructive">{t.portal.errors[nameError]}</p> : null}
          </div>
        </SettingsSection>
        <SettingsSection id="branding-logo" title={b.logoTitle} description={<span id="logo-hint">{b.logoHint}</span>}>
          {/* what staff see today: the logo, or the neutral mark that stands in for it */}
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-border p-4">
            <TenantIdentity name={displayName} logoSrc={logoSrc} />
            <span className="ms-auto text-xs text-subtle">{logoSrc ? b.currentLogo : b.noLogo}</span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="logo">{b.logoLabel}</Label>
            <Input
              id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp"
              aria-describedby={logoError ? "logo-hint logo-error" : "logo-hint"} aria-invalid={logoError ? true : undefined}
            />
            {logoError ? <p id="logo-error" role="alert" className="text-sm text-destructive">{t.portal.errors[logoError]}</p> : null}
          </div>
          {logoSrc ? (
            <div className="flex items-center gap-2">
              <Checkbox id="removeLogo" name="removeLogo" />
              <Label htmlFor="removeLogo">{b.removeLogo}</Label>
            </div>
          ) : null}
        </SettingsSection>
      </SettingsSections>
      <SettingsFooter>
        {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
        {state.ok ? <p role="status" className="text-sm">{b.saved}</p> : null}
        <Button type="submit" loading={pending}>{b.save}</Button>
      </SettingsFooter>
    </form>
  );
}
