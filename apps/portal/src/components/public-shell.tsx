import type { ReactNode } from "react";
import { TenantIdentity } from "@workspace/ui/components/tenant-identity";
import { tenantLogoSrc } from "@/lib/branding";
import { requireTenant } from "@/lib/tenant-context";

/** Layout of the signed-out pages: the tenant's own identity only (no provider branding), one narrow column. */
export async function PublicShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const tenant = await requireTenant();
  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <TenantIdentity name={tenant.displayName} logoSrc={tenantLogoSrc(tenant)} />
        <h1 className="text-xl font-semibold">{title}</h1>
        {intro ? <p className="text-muted-foreground">{intro}</p> : null}
        {children}
      </div>
    </main>
  );
}
