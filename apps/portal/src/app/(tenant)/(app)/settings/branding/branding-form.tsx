"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { LogoUpload } from "@workspace/ui/components/logo-upload";
import { SettingsFooter, SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
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
          <div className="grid gap-2">
            <Label htmlFor="logo">{b.logoLabel}</Label>
            <LogoUpload
              id="logo" name="logo" accept="image/png,image/jpeg,image/webp" alt={displayName}
              currentSrc={logoSrc} removeName="removeLogo" labels={{ prompt: b.uploadPrompt, remove: b.removeLogo }}
              errors={{ type: t.portal.errors.logo_type, tooLarge: t.portal.errors.logo_too_large, corrupt: t.portal.errors.logo_corrupt, dimensions: t.portal.errors.logo_dimensions }}
              describedBy={logoError ? "logo-hint logo-error" : "logo-hint"} invalid={Boolean(logoError)}
            />
            {logoError ? <p id="logo-error" role="alert" className="text-sm text-destructive">{t.portal.errors[logoError]}</p> : null}
          </div>
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
