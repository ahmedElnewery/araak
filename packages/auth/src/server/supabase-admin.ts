import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@workspace/db";

export type AdminClient = SupabaseClient<Database>;

let client: AdminClient | undefined;

/** Service-role client: server-only, no session persistence. Bypasses RLS, so every caller must authorize first. */
export function getSupabaseAdmin(): AdminClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Supabase admin client is not configured");
    client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
