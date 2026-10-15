import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@workspace/auth/server";
import { getServerEnv } from "@workspace/config/server";
import { classifyHost } from "../host";

export type ResolvedTenant = {
  id: string;
  subdomain: string;
  displayName: string;
  state: "active" | "suspended";
  logoVersion: number;
};

/**
 * The tenant for the current request, decided ONLY by the trusted host (never by a cookie, header the client
 * controls, or request body). Unknown or invalid hosts return null so callers render a neutral 404 with no tenant metadata.
 */
export const resolveTenantFromHost = cache(async (): Promise<ResolvedTenant | null> => {
  const env = getServerEnv("portal");
  const host = classifyHost(await headers(), {
    portalBaseDomain: env.PORTAL_BASE_DOMAIN,
    adminHost: env.ADMIN_HOST,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  if (host.kind !== "tenant") return null;
  const { data } = await getSupabaseAdmin()
    .from("tenants")
    .select("id, subdomain, display_name, state, logo_version")
    .eq("subdomain", host.subdomain)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, subdomain: data.subdomain, displayName: data.display_name, state: data.state, logoVersion: data.logo_version };
});
