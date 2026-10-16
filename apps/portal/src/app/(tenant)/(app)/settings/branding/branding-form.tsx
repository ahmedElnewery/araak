"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { saveBrandingAction } from "@/features/branding/actions";
import { initialFormState, type FormState } from "@/features/form-state";

type Props = { displayName: string; logoSrc: string | null; t: Dictionary };

export function BrandingForm({ displayName, logoSrc, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBrandingAction, initialFormState);
  const nameError = state.fieldErrors?.displayName;
  const logoError = state.fieldErrors?.logo;
  return (
    <form action={action} className="space-y-6" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="displayName">{t.portal.branding.nameLabel}</Label>
        <Input
          id="displayName" name="displayName" defaultValue={displayName} required maxLength={80} dir="auto"
          aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? "displayName-error" : undefined}
        />
        {nameError ? <p id="displayName-error" role="alert" className="text-sm text-destructive">{t.portal.errors[nameError]}</p> : null}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">{t.portal.branding.currentLogo}</p>
        <TenantIdentity name={displayName} logoSrc={logoSrc} />
        {logoSrc ? null : <p className="text-sm text-muted-foreground">{t.portal.branding.noLogo}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="logo">{t.portal.branding.logoLabel}</Label>
        <Input
          id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp"
          aria-describedby={logoError ? "logo-hint logo-error" : "logo-hint"} aria-invalid={logoError ? true : undefined}
        />
        <p id="logo-hint" className="text-sm text-muted-foreground">{t.portal.branding.logoHint}</p>
        {logoError ? <p id="logo-error" role="alert" className="text-sm text-destructive">{t.portal.errors[logoError]}</p> : null}
      </div>

      {logoSrc ? (
        <div className="flex items-center gap-2">
          <Checkbox id="removeLogo" name="removeLogo" />
          <Label htmlFor="removeLogo">{t.portal.branding.removeLogo}</Label>
        </div>
      ) : null}

      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{t.portal.branding.saved}</p> : null}
      <Button type="submit" loading={pending}>{t.portal.branding.save}</Button>
    </form>
  );
}
