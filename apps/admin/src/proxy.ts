import { NextResponse, type NextRequest } from "next/server";
import { refreshAuthCookies, withSecurityHeaders } from "@workspace/auth/proxy";
import { classifyHost, hostConfigFromEnv } from "@workspace/tenancy";

// Admin: only the exact ADMIN_HOST is served. Tenant subdomains and unknown hosts get a neutral 404 (FR-001).
export async function proxy(request: NextRequest) {
  const host = classifyHost(request.headers, hostConfigFromEnv(process.env));
  if (host.kind !== "admin") {
    return withSecurityHeaders(NextResponse.rewrite(new URL("/__unknown-host", request.url), { status: 404 }));
  }
  return withSecurityHeaders(await refreshAuthCookies(request, "admin"));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
