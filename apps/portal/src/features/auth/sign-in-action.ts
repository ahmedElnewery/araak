"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient, signInTenantStaff } from "@workspace/auth/server";
import { getServerEnv } from "@workspace/config/server";
import { requireTenant } from "@/lib/tenant-context";

export type SignInState = { error?: "invalid_credentials" };

const schema = z.object({ identifier: z.string().trim().min(1).max(320), password: z.string().min(1).max(256) });

/** One neutral failure for every cause (FR-014); the tenant is the HOST's, never a form field. */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const tenant = await requireTenant();
  const parsed = schema.safeParse({ identifier: formData.get("identifier"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid_credentials" };
  const env = getServerEnv("portal");
  const h = await headers();
  const result = await signInTenantStaff({
    tenantId: tenant.id,
    identifier: parsed.data.identifier,
    password: parsed.data.password,
    supabase: await createSupabaseServerClient("portal"),
    headers: h,
    userAgent: h.get("user-agent"),
    hmacKey: env.AUTH_THROTTLE_HMAC_KEY,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  if (!result.ok) return { error: "invalid_credentials" };
  redirect("/");
}
