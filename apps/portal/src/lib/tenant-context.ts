import "server-only";
import { notFound } from "next/navigation";
import { resolveTenantFromHost } from "@workspace/tenancy/server";

/** The tenant of the request, from the trusted host only. Unknown host: neutral 404. */
export async function requireTenant() {
  const tenant = await resolveTenantFromHost();
  if (!tenant) notFound();
  return tenant;
}
