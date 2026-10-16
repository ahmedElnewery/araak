"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { LogoUpload } from "@workspace/ui/components/logo-upload";
import { SettingsSection } from "@workspace/ui/components/settings-section";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { initialFormState, type FormState } from "@/features/form-state";
import { updateTenantLogoAction } from "@/features/tenants/logo-actions";

type Props = { tenantId: string; displayName: string; hasLogo: boolean; logoVersion: number; t: Dictionary["admin"] };

/** Logo intervention (FR-036): upload/replace or remove; the name has its own form above. */
export function BrandingPanel({ tenantId, displayName, hasLogo, logoVersion, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTenantLogoAction.bind(null, tenantId), initialFormState);
  const code = state.fieldErrors?.logo ?? state.error;
  return (
    <form action={action}>
      <SettingsSection id="tenant-logo" title={t.tenants.logoTitle} description={<span id="logo-hint">{t.tenants.logoIntro} {t.tenants.logoHint}</span>}>
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-border p-4">
          <TenantIdentity name={displayName} logoSrc={hasLogo ? `/tenants/${tenantId}/logo?v=${String(logoVersion)}` : null} />
          {hasLogo ? null : <span className="ms-auto text-xs text-subtle">{t.tenants.noLogo}</span>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="logo">{t.tenants.uploadLogo}</Label>
          <LogoUpload
            id="logo" name="logo" accept="image/png,image/jpeg,image/webp" alt={displayName}
            labels={{ prompt: t.tenants.uploadPrompt, remove: t.tenants.discardFile }}
            describedBy={code ? "logo-hint logo-error" : "logo-hint"} invalid={Boolean(code)}
          />
          {code ? <p id="logo-error" role="alert" className="text-sm text-destructive">{t.errors[code]}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" name="intent" value="upload" loading={pending}>{t.tenants.uploadLogo}</Button>
          {hasLogo ? <Button type="submit" name="intent" value="remove" variant="outline" loading={pending}>{t.tenants.removeLogo}</Button> : null}
          {state.ok ? <p role="status" className="text-sm">{t.tenants.logoSaved}</p> : null}
        </div>
      </SettingsSection>
    </form>
  );
}
