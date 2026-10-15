import type { ReactNode } from "react";

/** Neutral full-page message (404, errors, suspended). Carries no provider branding and no tenant data. */
export function StatusPage({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        {action}
      </div>
    </main>
  );
}
