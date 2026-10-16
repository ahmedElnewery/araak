"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { SettingsSection } from "@workspace/ui/components/settings-section";
import { PERSON_NAME_HINT_ID, PersonNameFields } from "@/components/person-name-fields";
import { changeNameAction } from "@/features/account/change-name-action";
import { initialFormState, type FormState } from "@/features/form-state";

// The name shown across the portal in place of the username. Accounts activated before names were collected have
// none until they save it here.
export function NameForm({ firstName, lastName, t }: { firstName: string | null; lastName: string | null; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeNameAction, initialFormState);
  const f = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate>
      <SettingsSection id="name-title" title={t.portal.account.changeName} description={<span id={PERSON_NAME_HINT_ID}>{t.personName.hint}</span>}>
        {!firstName || !lastName ? <p role="note" className="rounded-lg bg-secondary p-3 text-sm">{t.portal.account.nameMissing}</p> : null}
        <PersonNameFields
          t={t} defaultFirstName={firstName ?? ""} defaultLastName={lastName ?? ""}
          firstNameError={f.firstName} lastNameError={f.lastName} hideHint
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending}>{t.portal.account.saveName}</Button>
          {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
          {state.ok ? <p role="status" className="text-sm">{t.portal.account.nameSaved}</p> : null}
        </div>
      </SettingsSection>
    </form>
  );
}
