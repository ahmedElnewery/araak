"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseAdmin } from "@workspace/auth/server";
import { LOGO_BUCKET } from "@workspace/config";
import { processLogo } from "@workspace/config/server";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { toErrorCode } from "@/lib/rpc-error";
import type { FormState } from "../form-state";

const id = z.uuid();

/**
 * Platform intervention on a tenant's logo (FR-036): requires `tenants.manage`, never reads tenant-private data.
 * Upload with the service role, call the audited RPC, delete the previous object after commit.
 */
export async function updateTenantLogoAction(tenantId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.manage");
  if (!id.safeParse(tenantId).success) return { error: "tenant_not_found" };
  const remove = formData.get("intent") === "remove";
  const upload = formData.get("logo");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  if (!remove && !file) return { fieldErrors: { logo: "logo_type" } };
  const storage = getSupabaseAdmin().storage.from(LOGO_BUCKET);

  let newPath: string | null = null;
  if (file && !remove) {
    const checked = await processLogo({ bytes: new Uint8Array(await file.arrayBuffer()), declaredMime: file.type, fileName: file.name });
    if (!checked.ok) return { fieldErrors: { logo: checked.code } };
    newPath = `${tenantId}/${randomUUID()}.${checked.logo.extension}`;
    const { error } = await storage.upload(newPath, checked.logo.bytes, { contentType: checked.logo.mime, upsert: false });
    if (error) return { error: "logo_invalid" };
  }
  const { data, error } = await ctx.supabase.rpc("platform_update_tenant_logo", {
    p_tenant_id: tenantId, p_logo_object_path: newPath as string, p_remove: remove,
  });
  if (error) {
    if (newPath) await storage.remove([newPath]).catch(() => undefined);
    return { error: toErrorCode(error) };
  }
  const previous = (data as { previousLogoPath: string | null } | null)?.previousLogoPath;
  if (previous) await storage.remove([previous]).catch(() => undefined);
  revalidatePath(`/tenants/${tenantId}`);
  return { ok: true };
}
