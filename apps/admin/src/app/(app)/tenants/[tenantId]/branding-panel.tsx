"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { initialFormState, type FormState } from "@/features/form-state";
import { updateTenantLogoAction } from "@/features/tenants/logo-actions";

type Props = { tenantId: string; displayName: string; hasLogo: boolean; logoVersion: number; t: Dictionary["admin"] };

/** Logo intervention (FR-036): upload/replace or remove; the name has its own form above. */
export function BrandingPanel({ tenantId, displayName, hasLogo, logoVersion, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTenantLogoAction.bind(null, tenantId), initialFormState);
  const code = state.fieldErrors?.logo ?? state.error;
  return (
    <section aria-labelledby="logo-title" className="space-y-4">
      <h2 id="logo-title" className="text-lg font-medium">{t.tenants.logoTitle}</h2>
      <TenantIdentity name={displayName} logoSrc={hasLogo ? `/tenants/${tenantId}/logo?v=${String(logoVersion)}` : null} />
      {hasLogo ? null : <p className="text-sm text-muted-foreground">{t.tenants.noLogo}</p>}
      <form action={action} className="space-y-3">
        <div className="grid gap-2">
          <Label htmlFor="logo">{t.tenants.uploadLogo}</Label>
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-hint" />
          <p id="logo-hint" className="text-sm text-muted-foreground">{t.tenants.logoHint}</p>
          {code ? <p role="alert" className="text-sm text-destructive">{t.errors[code]}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" name="intent" value="upload" disabled={pending}>{t.tenants.uploadLogo}</Button>
          {hasLogo ? <Button type="submit" name="intent" value="remove" variant="outline" disabled={pending}>{t.tenants.removeLogo}</Button> : null}
          {state.ok ? <p role="status" className="text-sm">{t.tenants.logoSaved}</p> : null}
        </div>
      </form>
    </section>
  );
}
