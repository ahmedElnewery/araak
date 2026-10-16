"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { PasswordInput } from "@workspace/ui/components/password-input";
import { PersonNameFields } from "@/components/person-name-fields";
import { UsernameField } from "@/components/username-field";
import { acceptInvitationAction } from "@/features/invitations/accept-action";
import { initialFormState, type FormState } from "@/features/form-state";

export function AcceptForm({ token, email, t }: { token: string; email: string; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvitationAction.bind(null, token), initialFormState);
  const f = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-2">
        <Label>{t.portal.invite.email}</Label>
        <p className="flex h-12 items-center rounded-xl border border-input bg-background px-3 text-sm"><LtrText>{email}</LtrText></p>
      </div>
      <PersonNameFields t={t} size="lg" firstNameError={f.firstName} lastNameError={f.lastName} />
      <UsernameField t={t} size="lg" serverError={f.username} serverRule={state.usernameError} />
      <div className="grid gap-2">
        <Label htmlFor="password">{t.portal.invite.password}</Label>
        <PasswordInput
          id="password"
          name="password"
          size="lg"
          autoComplete="new-password"
          dir="ltr"
          required
          showPasswordLabel={t.portal.auth.showPassword}
          hidePasswordLabel={t.portal.auth.hidePassword}
          startIcon={<Lock className="size-4" />}
        />
        {f.password ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.password]}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">{t.portal.invite.confirmPassword}</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          size="lg"
          autoComplete="new-password"
          dir="ltr"
          required
          showPasswordLabel={t.portal.auth.showPassword}
          hidePasswordLabel={t.portal.auth.hidePassword}
          startIcon={<Lock className="size-4" />}
        />
        {f.confirmPassword ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.confirmPassword]}</p> : null}
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      <Button type="submit" size="xl" className="mt-2 w-full" disabled={pending}>{t.portal.invite.activate}</Button>
    </form>
  );
}
