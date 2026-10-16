"use client";

import { useState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import type { ErrorCode } from "@/lib/rpc-error";

type Props = {
  t: Dictionary;
  defaultFirstName?: string;
  defaultLastName?: string;
  firstNameError?: ErrorCode | undefined;
  lastNameError?: ErrorCode | undefined;
};

/**
 * First and last name inputs. Names may be Arabic or Latin, so each input takes the direction of what is typed.
 * Controlled, like UsernameField, so a refused submission keeps what was entered.
 */
export function PersonNameFields({ t, defaultFirstName = "", defaultLastName = "", firstNameError, lastNameError }: Props) {
  const [first, setFirst] = useState(defaultFirstName);
  const [last, setLast] = useState(defaultLastName);
  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="firstName">{t.personName.firstName}</Label>
        <Input
          id="firstName" name="firstName" dir="auto" autoComplete="given-name" required value={first}
          onChange={(e) => { setFirst(e.target.value); }}
          aria-invalid={firstNameError ? true : undefined} aria-describedby="person-name-hint first-name-error"
        />
        {firstNameError ? <p id="first-name-error" role="alert" className="text-sm text-destructive">{t.portal.errors[firstNameError]}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lastName">{t.personName.lastName}</Label>
        <Input
          id="lastName" name="lastName" dir="auto" autoComplete="family-name" required value={last}
          onChange={(e) => { setLast(e.target.value); }}
          aria-invalid={lastNameError ? true : undefined} aria-describedby="person-name-hint last-name-error"
        />
        {lastNameError ? <p id="last-name-error" role="alert" className="text-sm text-destructive">{t.portal.errors[lastNameError]}</p> : null}
      </div>
      <p id="person-name-hint" className="text-sm text-muted-foreground">{t.personName.hint}</p>
    </div>
  );
}
