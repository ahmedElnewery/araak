"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { changePasswordAction } from "@/features/account/change-password-action";
import { initialFormState, type FormState } from "@/features/form-state";

export function PasswordForm({ t }: { t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, initialFormState);
  const f = state.fieldErrors ?? {};
  const err = (k: string) => (f[k] ? <p role="alert" className="text-sm text-destructive">{k === "currentPassword" ? t.portal.password.wrongCurrent : t.portal.errors[f[k]]}</p> : null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">{t.portal.password.current}</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" dir="ltr" required />
        {err("currentPassword")}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="newPassword">{t.portal.password.new}</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" dir="ltr" required />
        {err("newPassword")}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">{t.portal.password.confirm}</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" required />
        {err("confirmPassword")}
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{t.portal.password.done}</p> : null}
      <Button type="submit" loading={pending}>{t.portal.password.submit}</Button>
    </form>
  );
}
