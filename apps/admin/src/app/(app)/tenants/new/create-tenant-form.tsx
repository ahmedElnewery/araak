"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { SettingsFooter, SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { DISPLAY_NAME_MAX } from "@workspace/config";
import type { Dictionary } from "@workspace/i18n";
import { createTenantAction } from "@/features/tenants/create-tenant-action";
import { initialFormState, type FormState } from "@/features/form-state";
import { createTenantSchema, fieldErrors } from "@/features/tenants/schema";

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

export function CreateTenantForm({ t }: { t: Dictionary["admin"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTenantAction, initialFormState);
  const [clientErrors, setClientErrors] = useState<FormState["fieldErrors"]>({});
  const errors = { ...state.fieldErrors, ...clientErrors };
  const msg = (code: string | undefined) => (code ? t.errors[code as keyof typeof t.errors] : undefined);

  return (
    <form
      action={action}
      noValidate
      className={settingsCard}
      onSubmit={(e) => {
        // Client-side pre-check with the same schema as the server; the server and the database re-validate.
        const fd = new FormData(e.currentTarget);
        const r = createTenantSchema.safeParse({
          displayName: fd.get("displayName"), subdomain: fd.get("subdomain"),
          initialState: fd.get("initialState"), managerEmail: fd.get("managerEmail"),
        });
        if (!r.success) {
          e.preventDefault();
          setClientErrors(fieldErrors(r.error));
        } else setClientErrors({});
      }}
    >
      <SettingsSections>
        <SettingsSection id="tenant-identity" title={t.tenants.identityTitle} description={t.tenants.identityIntro}>
          <Field id="displayName" label={t.tenants.displayName} error={msg(errors.displayName)}>
            <Input id="displayName" name="displayName" required maxLength={DISPLAY_NAME_MAX} dir="auto" aria-invalid={!!errors.displayName} />
          </Field>
          <Field id="subdomain" label={t.tenants.subdomain} hint={t.tenants.subdomainHint} error={msg(errors.subdomain)}>
            <Input id="subdomain" name="subdomain" required maxLength={63} dir="ltr" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.subdomain} />
          </Field>
          <Field id="initialState" label={t.tenants.initialState}>
            <select id="initialState" name="initialState" defaultValue="active" className={selectClass}>
              <option value="active">{t.tenants.stateActive}</option>
              <option value="suspended">{t.tenants.stateSuspended}</option>
            </select>
          </Field>
        </SettingsSection>
        <SettingsSection id="tenant-manager" title={t.tenants.managerTitle} description={t.tenants.managerIntro}>
          <Field id="managerEmail" label={t.tenants.managerEmail} error={msg(errors.managerEmail)}>
            <Input id="managerEmail" name="managerEmail" type="email" required dir="ltr" autoComplete="off" aria-invalid={!!errors.managerEmail} />
          </Field>
        </SettingsSection>
      </SettingsSections>
      <SettingsFooter>
        {state.error ? <p role="alert" className="text-sm text-destructive">{msg(state.error)}</p> : null}
        <Button type="submit" loading={pending}>{t.tenants.create}</Button>
      </SettingsFooter>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | undefined; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
