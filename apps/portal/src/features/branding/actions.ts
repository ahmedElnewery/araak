"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@workspace/auth/server";
import { LOGO_BUCKET, validateDisplayName } from "@workspace/config";
import { requireManager } from "@/lib/guards";
import { toErrorCode } from "@/lib/rpc-error";
import { field, type FormState } from "../form-state";
import { validateLogoFile } from "./validate-logo";

/**
 * Manager-only branding update (FR-036). Order: validate, upload with the service role, call the RPC (which re-checks
 * manager authority), then delete the previous object after commit. A failed RPC removes the new object again.
 */
export async function saveBrandingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireManager();
  const name = validateDisplayName(field(formData, "displayName"));
  if (!name.ok) return { fieldErrors: { displayName: name.code } };

  const remove = formData.get("removeLogo") === "on";
  const upload = formData.get("logo");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  const storage = getSupabaseAdmin().storage.from(LOGO_BUCKET);

  let newPath: string | null = null;
  if (file && !remove) {
    const checked = await validateLogoFile(file);
    if (!checked.ok) return { fieldErrors: { logo: checked.code } };
    newPath = `${ctx.tenantId}/${randomUUID()}.${checked.logo.extension}`;
    const { error } = await storage.upload(newPath, checked.logo.bytes, { contentType: checked.logo.mime, upsert: false });
    if (error) return { error: "logo_invalid" };
  }

  const { data, error } = await ctx.supabase.rpc("update_tenant_branding", {
    p_display_name: name.value, p_logo_object_path: newPath as string, p_remove_logo: remove,
  });
  if (error) {
    if (newPath) await storage.remove([newPath]).catch(() => undefined);
    const code = toErrorCode(error);
    return code === "name_required" || code === "name_invalid" ? { fieldErrors: { displayName: code } } : { error: code };
  }
  const previous = (data as { previousLogoPath: string | null } | null)?.previousLogoPath;
  if (previous) await storage.remove([previous]).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}
