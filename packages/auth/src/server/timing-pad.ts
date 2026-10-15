import "server-only";
import { createClient } from "@supabase/supabase-js";
import { generateToken } from "../tokens";
import { getSupabaseAdmin } from "./supabase-admin";

/** An Auth identity that is never linked to a tenant, so it can never gain access. Excluded by reconcile-auth-users. */
export const TIMING_PAD_EMAIL = "signin-timing-pad@example.com";

let ensured: Promise<void> | undefined;
function ensurePadIdentity(): Promise<void> {
  ensured ??= getSupabaseAdmin()
    .auth.admin.createUser({ email: TIMING_PAD_EMAIL, password: `${generateToken()}Aa1`, email_confirm: true })
    .then(() => undefined, () => undefined);
  return ensured;
}

/**
 * Sign-in for an unknown, throttled or foreign identifier still performs one real failed password check against an
 * existing identity, so every failure path costs the same (research.md R-02 item 5). Uses a throwaway client: nothing
 * is persisted and the wrong password can never succeed.
 */
export async function padFailedSignIn(): Promise<void> {
  await ensurePadIdentity();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  await client.auth.signInWithPassword({ email: TIMING_PAD_EMAIL, password: `wrong-${generateToken()}` }).then(() => undefined, () => undefined);
}
