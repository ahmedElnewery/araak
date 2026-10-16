"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { PasswordInput } from "@workspace/ui/components/password-input";
import { completeRecoveryAction, type RecoveryCompleteState } from "@/features/recovery/complete-action";

export function CompleteForm({ token, t }: { token: string; t: Dictionary }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<RecoveryCompleteState, FormData>(completeRecoveryAction.bind(null, token), {});

  useEffect(() => {
    if (!state.done) return;
    router.replace("/login?notice=password-changed");
  }, [state.done, router]);

  if (state.done) return null;
  const f = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="password">{t.portal.recovery.newPassword}</Label>
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
        <Label htmlFor="confirmPassword">{t.portal.recovery.confirmPassword}</Label>
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
      {state.error === "invalid" ? <p role="alert" className="text-sm text-destructive">{t.portal.recovery.invalidBody}</p> : null}
      {state.error === "failed" ? <p role="alert" className="text-sm text-destructive">{t.portal.recovery.retryNeeded}</p> : null}
      <Button type="submit" size="xl" className="mt-2 w-full" loading={pending}>{t.portal.recovery.submit}</Button>
    </form>
  );
}
