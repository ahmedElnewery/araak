"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { requestRecoveryAction, type RecoveryRequestState } from "@/features/recovery/request-action";

export function RequestForm({ t }: { t: Dictionary["portal"]["recovery"] }) {
  const [state, action, pending] = useActionState<RecoveryRequestState, FormData>(requestRecoveryAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="identifier">{t.identifier}</Label>
        <Input id="identifier" name="identifier" autoComplete="username" dir="ltr" required />
      </div>
      {state.done ? <p role="status" className="text-sm">{t.neutral}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{t.send}</Button>
    </form>
  );
}
