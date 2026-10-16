"use client";

import { useActionState } from "react";
import { DISPLAY_NAME_MAX } from "@workspace/config";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { SettingsSection } from "@workspace/ui/components/settings-section";
import { initialFormState, type FormState } from "@/features/form-state";
import { updateTenantNameAction } from "@/features/tenants/update-tenant-actions";

type Props = { tenantId: string; displayName: string; subdomain: string; t: Dictionary["admin"] };

export function NameForm({ tenantId, displayName, subdomain, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTenantNameAction.bind(null, tenantId), initialFormState);
  const code = state.fieldErrors?.displayName ?? state.error;
  return (
    <form action={action}>
      <SettingsSection id="tenant-name" title={t.tenants.nameTitle} description={t.tenants.nameIntro}>
        <div className="grid gap-2">
          <Label htmlFor="displayName">{t.tenants.displayName}</Label>
          <Input id="displayName" name="displayName" defaultValue={displayName} required maxLength={DISPLAY_NAME_MAX} dir="auto" />
          {code ? <p role="alert" className="text-sm text-destructive">{t.errors[code]}</p> : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="subdomain">{t.tenants.subdomain}</Label>
          <Input id="subdomain" value={subdomain} readOnly dir="ltr" aria-describedby="subdomain-hint" />
          <p id="subdomain-hint" className="text-sm text-muted-foreground">{t.tenants.subdomainReadOnly}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending}>{t.tenants.saveName}</Button>
          {state.ok ? <p role="status" className="text-sm">{t.tenants.nameSaved}</p> : null}
        </div>
      </SettingsSection>
    </form>
  );
}
