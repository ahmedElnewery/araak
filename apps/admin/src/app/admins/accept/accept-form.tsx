"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { initialFormState, type FormState } from "@/features/form-state";
import { acceptInvitationAction } from "@/features/platform-admins/accept-action";

export function AcceptForm({ token, t }: { token: string; t: Dictionary["admin"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvitationAction.bind(null, token), initialFormState);
  const pw = state.fieldErrors?.password;
  const cf = state.fieldErrors?.confirmPassword;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required />
        {pw ? <p role="alert" className="text-sm text-destructive">{t.errors[pw]}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">{t.auth.confirmPassword}</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" required />
        {cf ? <p role="alert" className="text-sm text-destructive">{t.errors[cf]}</p> : null}
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.errors[state.error]}</p> : null}
      <Button type="submit" className="w-full" loading={pending}>{t.admins.accept}</Button>
    </form>
  );
}
