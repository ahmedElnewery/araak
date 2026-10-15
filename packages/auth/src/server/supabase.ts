import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@workspace/db";
import { getClientEnv } from "@workspace/config";

export type AppName = "portal" | "admin";
export type ServerClient = SupabaseClient<Database>;

/**
 * Cookie-bound client for the current request. Cookies are host-only (no Domain attribute, so a session never
 * spans tenant subdomains), httpOnly, SameSite=Lax, Secure outside development, with a distinct name per app.
 */
export async function createSupabaseServerClient(app: AppName): Promise<ServerClient> {
  const store = await cookies();
  const env = getClientEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: {
      name: `${app}-auth`,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ENV !== "development",
      path: "/",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            const { domain: _domain, ...host } = options ?? {};
            store.set(name, value, host);
          }
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  }) as unknown as ServerClient;
}
