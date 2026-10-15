import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./env";

const base = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;

export function adminClient(): SupabaseClient {
  const env = loadTestEnv();
  return createClient(env.url, env.secretKey, base);
}

/** A fresh, non-persisting client using the publishable key (one per simulated device). */
export function deviceClient(): SupabaseClient {
  const env = loadTestEnv();
  return createClient(env.url, env.publishableKey, base);
}

export function decodeJwt(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
}
