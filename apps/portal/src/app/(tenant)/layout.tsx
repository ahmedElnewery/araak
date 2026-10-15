import type { ReactNode } from "react";
import { requireTenant } from "@/lib/tenant-context";

// Every tenant page first proves the host maps to a real tenant; otherwise a neutral 404 (no tenant metadata).
export default async function TenantLayout({ children }: { children: ReactNode }) {
  await requireTenant();
  return children;
}
