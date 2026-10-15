"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createMailer, getSupabaseAdmin, issueStaffInvitation } from "@workspace/auth/server";
import { getServerEnv } from "@workspace/config/server";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { RpcError, codeOf, toErrorCode } from "@/lib/rpc-error";
import type { FormState } from "../form-state";
import { fieldErrors, inviteEmailSchema } from "../tenants/schema";

const id = z.uuid();

export async function promoteManager(tenantId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.managers.manage");
  const staffId = z.uuid().safeParse(formData.get("staffId"));
  if (!id.safeParse(tenantId).success || !staffId.success) return { error: "staff_not_found" };
  const { error } = await ctx.supabase.rpc("platform_grant_tenant_manager", { p_tenant_id: tenantId, p_staff_id: staffId.data });
  if (error) return { error: toErrorCode(error) };
  revalidatePath(`/tenants/${tenantId}`);
  return { ok: true };
}

export async function revokeManager(tenantId: string, staffId: string): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.managers.manage");
  if (!id.safeParse(tenantId).success || !id.safeParse(staffId).success) return { error: "staff_not_found" };
  const { error } = await ctx.supabase.rpc("platform_revoke_tenant_manager", { p_tenant_id: tenantId, p_staff_id: staffId });
  if (error) return { error: toErrorCode(error) };
  revalidatePath(`/tenants/${tenantId}`);
  return { ok: true };
}

export async function inviteManager(tenantId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.managers.manage");
  if (!id.safeParse(tenantId).success) return { error: "tenant_not_found" };
  const parsed = inviteEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const env = getServerEnv("admin");
  const { locale } = await getI18n();
  const { data: tenant } = await getSupabaseAdmin().from("tenants").select("display_name, subdomain").eq("id", tenantId).maybeSingle();
  if (!tenant) return { error: "tenant_not_found" };
  try {
    const r = await issueStaffInvitation({
      tenant: { id: tenantId, displayName: tenant.display_name, subdomain: tenant.subdomain },
      recipientEmail: parsed.data.email,
      locale,
      mailer: createMailer(env),
      portalBaseDomain: env.PORTAL_BASE_DOMAIN,
      appEnv: env.APP_ENV,
      actor: { kind: "platform_admin", id: ctx.authUserId },
      persist: async (tokenHash) => {
        const { data, error } = await ctx.supabase.rpc("platform_invite_tenant_manager", {
          p_tenant_id: tenantId, p_email: parsed.data.email, p_token_hash: tokenHash,
        });
        if (error || !data) throw new RpcError(error ? toErrorCode(error) : "generic");
        return data;
      },
    });
    revalidatePath(`/tenants/${tenantId}`);
    return r.delivered ? { ok: true } : { ok: true, notice: "invitation_not_delivered" };
  } catch (e) {
    const code = codeOf(e);
    return code === "email_invalid" || code === "email_unavailable" ? { fieldErrors: { email: code } } : { error: code };
  }
}
