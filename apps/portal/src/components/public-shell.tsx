import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { tenantLogoSrc } from "@/lib/branding";
import { requireTenant } from "@/lib/tenant-context";

/** Signed-out pages: centered tenant logo, no association name, one card on the page background. */
export async function PublicShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const tenant = await requireTenant();
  const logoSrc = tenantLogoSrc(tenant);

  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-[460px] space-y-6 rounded-[19px] border border-border bg-card p-[clamp(1.5rem,3.4vw,2.625rem)]">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={tenant.displayName}
            width={64}
            height={64}
            className="mx-auto size-16 rounded-full border border-border bg-white object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="mx-auto flex size-16 items-center justify-center rounded-full border border-border bg-accent text-accent-foreground"
          >
            <Building2 className="size-8" />
          </span>
        )}
        <h1 className="text-[1.4375rem] font-extrabold tracking-tight">{title}</h1>
        {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
        {children}
      </div>
    </main>
  );
}
