"use client";

import { useActionState, useEffect } from "react";
import { Lock, User } from "lucide-react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { PasswordInput } from "@workspace/ui/components/password-input";
import { toast } from "@workspace/ui/components/sonner";
import { signInAction, type SignInState } from "@/features/auth/sign-in-action";

export function LoginForm({
  labels,
  passwordChangedMessage,
}: {
  labels: Dictionary["portal"]["auth"];
  passwordChangedMessage?: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});

  useEffect(() => {
    if (!passwordChangedMessage) return;
    toast.success(passwordChangedMessage, { id: "password-changed", duration: 8000 });
    const url = new URL(window.location.href);
    if (url.searchParams.get("notice") !== "password-changed") return;
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [passwordChangedMessage]);

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="identifier">{labels.identifier}</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-0 z-10 flex items-center ps-3.5 text-subtle"
          >
            <User className="size-4" />
          </span>
          <Input
            id="identifier"
            name="identifier"
            size="lg"
            autoComplete="username"
            dir="ltr"
            required
            className="ps-12"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{labels.password}</Label>
        <PasswordInput
          id="password"
          name="password"
          size="lg"
          autoComplete="current-password"
          dir="ltr"
          required
          showPasswordLabel={labels.showPassword}
          hidePasswordLabel={labels.hidePassword}
          startIcon={<Lock className="size-4" />}
        />
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{labels.invalidCredentials}</p> : null}
      <Button type="submit" size="xl" className="mt-2 w-full" disabled={pending}>
        {labels.signIn}
      </Button>
    </form>
  );
}
