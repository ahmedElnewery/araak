import type { MetadataRoute } from "next";
import { resolveTenantFromHost } from "@workspace/tenancy/server";

// Tenant name and neutral/own icon only; no product name (FR-035, FR-037). Host-dependent, so never prerendered.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await resolveTenantFromHost();
  const name = tenant?.displayName ?? "";
  return {
    name, short_name: name, start_url: "/", display: "standalone",
    icons: [{ src: "/icon", sizes: "64x64", type: "image/png" }],
  };
}
