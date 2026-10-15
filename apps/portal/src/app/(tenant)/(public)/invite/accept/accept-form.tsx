"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { UsernameField } from "@/components/username-field";
import { acceptInvitationAction } from "@/features/invitations/accept-action";
import { initialFormState, type FormState } from "@/features/form-state";

export function AcceptForm({ token, email, t }: { token: string; email: string; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvitationAction.bind(null, token), initialFormState);
  const f = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label>{t.portal.invite.email}</Label>
        <p className="rounded-md border bg-muted px-3 py-2 text-sm"><LtrText>{email}</LtrText></p>
      </div>
      <UsernameField t={t} serverError={f.username} serverRule={state.usernameError} />
      <div className="grid gap-2">
        <Label htmlFor="password">{t.portal.invite.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required />
        {f.password ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.password]}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">{t.portal.invite.confirmPassword}</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" required />
        {f.confirmPassword ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.confirmPassword]}</p> : null}
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{t.portal.invite.activate}</Button>
    </form>
  );
}
