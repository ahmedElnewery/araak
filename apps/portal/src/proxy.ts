import { NextResponse, type NextRequest } from "next/server";
import { refreshAuthCookies, withSecurityHeaders } from "@workspace/auth/proxy";
import { classifyHost, hostConfigFromEnv } from "@workspace/tenancy";

// Portal: only tenant hosts get through. Anything else is a neutral 404 that reveals nothing about tenants (FR-004).
export async function proxy(request: NextRequest) {
  const host = classifyHost(request.headers, hostConfigFromEnv(process.env));
  if (host.kind !== "tenant") {
    return withSecurityHeaders(NextResponse.rewrite(new URL("/__unknown-host", request.url), { status: 404 }));
  }
  return withSecurityHeaders(await refreshAuthCookies(request, "portal"));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
