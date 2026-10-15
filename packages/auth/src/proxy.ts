// Used from each app's proxy.ts. Deliberately has no `server-only` import and no next/headers.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export type ProxyApp = "portal" | "admin";

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'" + (isDev ? " ws:" : ""),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(process.env.APP_ENV === "development"));
  return response;
}

/**
 * Refreshes the Supabase auth cookies for a normal request (the @supabase/ssr proxy pattern). It only verifies and
 * rotates tokens: it never writes session activity, because passive requests and token refresh must not extend a
 * session's inactivity window (CL-036). Cookies stay host-only (no Domain attribute).
 */
export async function refreshAuthCookies(request: NextRequest, app: ProxyApp): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookieOptions: { name: `${app}-auth`, httpOnly: true, sameSite: "lax", secure: process.env.APP_ENV !== "development", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, { ...options, domain: undefined }); // host-only: never a Domain attribute
        }
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}
