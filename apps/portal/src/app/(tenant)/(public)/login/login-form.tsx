"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { signInAction, type SignInState } from "@/features/auth/sign-in-action";

export function LoginForm({ labels }: { labels: Dictionary["portal"]["auth"] }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="identifier">{labels.identifier}</Label>
        <Input id="identifier" name="identifier" autoComplete="username" dir="ltr" required aria-describedby="identifier-hint" />
        <p id="identifier-hint" className="text-sm text-muted-foreground">{labels.identifierHint}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required />
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{labels.invalidCredentials}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{labels.signIn}</Button>
    </form>
  );
}
