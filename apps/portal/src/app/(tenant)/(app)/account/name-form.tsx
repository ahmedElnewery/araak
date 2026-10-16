"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { PersonNameFields } from "@/components/person-name-fields";
import { changeNameAction } from "@/features/account/change-name-action";
import { initialFormState, type FormState } from "@/features/form-state";

// The name shown across the portal in place of the username. Accounts activated before names were collected have
// none until they save it here.
export function NameForm({ firstName, lastName, t }: { firstName: string | null; lastName: string | null; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeNameAction, initialFormState);
  const f = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <h2 className="text-lg font-medium">{t.portal.account.changeName}</h2>
      {!firstName || !lastName ? <p className="text-sm">{t.portal.account.nameMissing}</p> : null}
      <PersonNameFields
        t={t} defaultFirstName={firstName ?? ""} defaultLastName={lastName ?? ""}
        firstNameError={f.firstName} lastNameError={f.lastName}
      />
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{t.portal.account.nameSaved}</p> : null}
      <Button type="submit" disabled={pending}>{t.portal.account.saveName}</Button>
    </form>
  );
}
