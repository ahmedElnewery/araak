"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { SettingsSection } from "@workspace/ui/components/settings-section";
import { USERNAME_HINT_ID, UsernameField } from "@/components/username-field";
import { changeUsernameAction } from "@/features/account/change-username-action";
import { initialFormState, type FormState } from "@/features/form-state";

// No password field: a live session is enough to change the username (CL-011).
export function UsernameForm({ current, t }: { current: string; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeUsernameAction, initialFormState);
  return (
    <form action={action} noValidate>
      <SettingsSection id="username-title" title={t.portal.account.username} description={<span id={USERNAME_HINT_ID}>{t.username.hint}</span>}>
        <UsernameField t={t} defaultValue={current} serverError={state.fieldErrors?.username} serverRule={state.usernameError} hideHint />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending}>{t.portal.account.save}</Button>
          {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
          {state.ok ? <p role="status" className="text-sm">{t.portal.account.saved}</p> : null}
        </div>
      </SettingsSection>
    </form>
  );
}
