"use client";

import { useActionState, useEffect } from "react";
import { User } from "lucide-react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { toast } from "@workspace/ui/components/sonner";
import { requestRecoveryAction, type RecoveryRequestState } from "@/features/recovery/request-action";

export function RequestForm({ t }: { t: Dictionary["portal"]["recovery"] }) {
  const [state, action, pending] = useActionState<RecoveryRequestState, FormData>(requestRecoveryAction, {});

  useEffect(() => {
    if (!state.submittedAt) return;
    toast.success(t.neutral, { id: `recovery-sent-${state.submittedAt}`, duration: 8000 });
  }, [state.submittedAt, t.neutral]);

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="identifier">{t.identifier}</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-0 z-10 flex items-center ps-3.5 text-subtle"
          >
            <User className="size-4" />
          </span>
          <Input id="identifier" name="identifier" size="lg" autoComplete="username" dir="ltr" required className="ps-12" />
        </div>
      </div>
      <Button type="submit" size="xl" className="mt-2 w-full" loading={pending}>{t.send}</Button>
    </form>
  );
}
