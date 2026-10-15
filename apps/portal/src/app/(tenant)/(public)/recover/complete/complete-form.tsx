"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { completeRecoveryAction, type RecoveryCompleteState } from "@/features/recovery/complete-action";

export function CompleteForm({ token, t }: { token: string; t: Dictionary }) {
  const [state, action, pending] = useActionState<RecoveryCompleteState, FormData>(completeRecoveryAction.bind(null, token), {});
  if (state.done) {
    return (
      <div className="space-y-4">
        <p role="status">{t.portal.recovery.done}</p>
        <Link className="underline" href="/login">{t.portal.recovery.backToSignIn}</Link>
      </div>
    );
  }
  const f = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="password">{t.portal.recovery.newPassword}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required />
        {f.password ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.password]}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">{t.portal.recovery.confirmPassword}</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" required />
        {f.confirmPassword ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[f.confirmPassword]}</p> : null}
      </div>
      {state.error === "invalid" ? <p role="alert" className="text-sm text-destructive">{t.portal.recovery.invalidBody}</p> : null}
      {state.error === "failed" ? <p role="alert" className="text-sm text-destructive">{t.portal.recovery.retryNeeded}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{t.portal.recovery.submit}</Button>
    </form>
  );
}
