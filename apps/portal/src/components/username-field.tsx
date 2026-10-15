"use client";

import { useState } from "react";
import { usernameErrorKey, validateUsername, type UsernameError } from "@workspace/auth";
import type { Dictionary } from "@workspace/i18n";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import type { ErrorCode } from "@/lib/rpc-error";

type Props = {
  t: Dictionary;
  defaultValue?: string;
  /** Error reported by the server action (rule or database code). */
  serverError?: ErrorCode | undefined;
  serverRule?: UsernameError | undefined;
};

/** Shows the localized rules and an inline error for an invalid name as the user types (FR-010). */
export function UsernameField({ t, defaultValue = "", serverError, serverRule }: Props) {
  const [value, setValue] = useState(defaultValue);
  const [touched, setTouched] = useState(false);
  const local = touched && value !== "" ? validateUsername(value) : ({ ok: true } as const);
  let message: string | null = null;
  if (!local.ok) message = t.username[usernameErrorKey(local.code)];
  else if (serverRule) message = t.username[usernameErrorKey(serverRule)];
  else if (serverError) message = t.portal.errors[serverError];
  return (
    <div className="grid gap-2">
      <Label htmlFor="username">{t.username.label}</Label>
      <Input
        id="username" name="username" dir="ltr" autoComplete="username" required value={value}
        onChange={(e) => { setValue(e.target.value); setTouched(true); }}
        onBlur={() => {
          setTouched(true);
        }}
        aria-invalid={message ? true : undefined} aria-describedby="username-hint username-error"
      />
      <p id="username-hint" className="text-sm text-muted-foreground">{t.username.hint}</p>
      {message ? <p id="username-error" role="alert" className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
