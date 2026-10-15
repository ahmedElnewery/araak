import type { ResolvedTenant } from "@workspace/tenancy/server";

/** Same-origin logo route, cache-keyed by version. Null when the tenant has no logo (neutral icon is shown instead). */
export function tenantLogoSrc(tenant: Pick<ResolvedTenant, "hasLogo" | "logoVersion">): string | null {
  return tenant.hasLogo ? `/branding/logo?v=${String(tenant.logoVersion)}` : null;
}
