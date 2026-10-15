"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { initialFormState, type FormState } from "@/features/form-state";
import { invitePlatformAdminAction } from "@/features/platform-admins/invite-action";

type Props = { t: Dictionary["admin"]; capabilities: (keyof Dictionary["admin"]["capabilities"])[] };

export function InviteForm({ t, capabilities }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(invitePlatformAdminAction, initialFormState);
  const emailError = state.fieldErrors?.email;
  const capError = state.fieldErrors?.capabilities;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" name="email" type="email" dir="ltr" required autoComplete="off" />
        {emailError ? <p role="alert" className="text-sm text-destructive">{t.errors[emailError]}</p> : null}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.admins.capabilities}</legend>
        {capabilities.map((c) => (
          <div key={c} className="flex items-center gap-2">
            <Checkbox id={`cap-${c}`} name="capabilities" value={c} />
            <Label htmlFor={`cap-${c}`}>{t.capabilities[c]}</Label>
          </div>
        ))}
        {capError ? <p role="alert" className="text-sm text-destructive">{t.errors[capError]}</p> : null}
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.errors[state.error]}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{state.notice ? t.admins.invitationNotDelivered : t.admins.invitationSent}</p> : null}
      <Button type="submit" disabled={pending}>{t.admins.sendInvitation}</Button>
    </form>
  );
}
