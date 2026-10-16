"use client";

import { useState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Input, type InputProps } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import type { ErrorCode } from "@/lib/rpc-error";

type Props = {
  t: Dictionary;
  defaultFirstName?: string;
  defaultLastName?: string;
  firstNameError?: ErrorCode | undefined;
  lastNameError?: ErrorCode | undefined;
  size?: InputProps["size"];
  /** The caller shows the hint itself, with the id PERSON_NAME_HINT_ID (a settings section's description). */
  hideHint?: boolean;
};

export const PERSON_NAME_HINT_ID = "person-name-hint";

/**
 * First and last name inputs. Names may be Arabic or Latin, so each input takes the direction of what is typed.
 * Controlled, like UsernameField, so a refused submission keeps what was entered.
 */
export function PersonNameFields({ t, defaultFirstName = "", defaultLastName = "", firstNameError, lastNameError, size, hideHint = false }: Props) {
  const [first, setFirst] = useState(defaultFirstName);
  const [last, setLast] = useState(defaultLastName);
  return (
    <div className="@container space-y-4">
      {/* side by side once the form has room for two fields, wherever it is placed */}
      <div className="grid gap-4 @md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="firstName">{t.personName.firstName}</Label>
          <Input
            id="firstName" name="firstName" size={size} dir="auto" autoComplete="given-name" required value={first}
            onChange={(e) => { setFirst(e.target.value); }}
            aria-invalid={firstNameError ? true : undefined} aria-describedby={`${PERSON_NAME_HINT_ID} first-name-error`}
          />
          {firstNameError ? <p id="first-name-error" role="alert" className="text-sm text-destructive">{t.portal.errors[firstNameError]}</p> : null}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="lastName">{t.personName.lastName}</Label>
          <Input
            id="lastName" name="lastName" size={size} dir="auto" autoComplete="family-name" required value={last}
            onChange={(e) => { setLast(e.target.value); }}
            aria-invalid={lastNameError ? true : undefined} aria-describedby={`${PERSON_NAME_HINT_ID} last-name-error`}
          />
          {lastNameError ? <p id="last-name-error" role="alert" className="text-sm text-destructive">{t.portal.errors[lastNameError]}</p> : null}
        </div>
      </div>
      {hideHint ? null : <p id={PERSON_NAME_HINT_ID} className="text-sm text-muted-foreground">{t.personName.hint}</p>}
    </div>
  );
}
