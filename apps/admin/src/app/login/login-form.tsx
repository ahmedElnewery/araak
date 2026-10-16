"use client";

import { useActionState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { signInAction, type SignInState } from "@/features/auth/sign-in-action";

type Labels = { email: string; password: string; signIn: string; invalidCredentials: string };

export function LoginForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">{labels.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="username" dir="ltr" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {labels.invalidCredentials}
        </p>
      ) : null}
      <Button type="submit" className="w-full" loading={pending}>
        {labels.signIn}
      </Button>
    </form>
  );
}
