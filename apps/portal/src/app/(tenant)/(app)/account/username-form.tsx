"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { UsernameField } from "@/components/username-field";
import { changeUsernameAction } from "@/features/account/change-username-action";
import { initialFormState, type FormState } from "@/features/form-state";

// No password field: a live session is enough to change the username (CL-011).
export function UsernameForm({ current, t }: { current: string; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeUsernameAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <h2 className="text-lg font-medium">{t.portal.account.changeUsername}</h2>
      <UsernameField t={t} defaultValue={current} serverError={state.fieldErrors?.username} serverRule={state.usernameError} />
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{t.portal.account.saved}</p> : null}
      <Button type="submit" loading={pending}>{t.portal.account.save}</Button>
    </form>
  );
}
