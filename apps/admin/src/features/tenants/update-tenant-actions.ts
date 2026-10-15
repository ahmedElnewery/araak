"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { toErrorCode } from "@/lib/rpc-error";
import { z } from "zod";
import type { FormState } from "../form-state";
import { fieldErrors, renameTenantSchema } from "./schema";

const id = z.uuid();
const stateSchema = z.enum(["active", "suspended"]);

export async function updateTenantNameAction(tenantId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.manage");
  if (!id.safeParse(tenantId).success) return { error: "tenant_not_found" };
  const parsed = renameTenantSchema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase.rpc("platform_update_tenant_name", { p_tenant_id: tenantId, p_display_name: parsed.data.displayName });
  if (error) return { error: toErrorCode(error) };
  revalidatePath(`/tenants/${tenantId}`);
  return { ok: true };
}

export async function setTenantStateAction(tenantId: string, state: "active" | "suspended"): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.manage");
  if (!id.safeParse(tenantId).success || !stateSchema.safeParse(state).success) return { error: "tenant_not_found" };
  const { error } = await ctx.supabase.rpc("platform_set_tenant_state", { p_tenant_id: tenantId, p_state: state });
  if (error) return { error: toErrorCode(error) };
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/tenants");
  return { ok: true };
}
