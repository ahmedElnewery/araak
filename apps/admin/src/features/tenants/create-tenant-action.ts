"use server";

import { redirect } from "next/navigation";
import { createMailer, getSupabaseAdmin, issueStaffInvitation } from "@workspace/auth/server";
import { getServerEnv } from "@workspace/config/server";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { RpcError, codeOf, toErrorCode } from "@/lib/rpc-error";
import type { FormState } from "../form-state";
import { createTenantSchema, fieldErrors } from "./schema";

export async function createTenantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.manage");
  const parsed = createTenantSchema.safeParse({
    displayName: formData.get("displayName"),
    subdomain: formData.get("subdomain"),
    initialState: formData.get("initialState") ?? "active",
    managerEmail: formData.get("managerEmail"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const env = getServerEnv("admin");
  const { locale } = await getI18n();

  let created: { tenantId: string; delivered: boolean };
  try {
    const r = await issueStaffInvitation({
      tenant: { displayName: v.displayName, subdomain: v.subdomain },
      recipientEmail: v.managerEmail,
      locale,
      mailer: createMailer(env),
      portalBaseDomain: env.PORTAL_BASE_DOMAIN,
      appEnv: env.APP_ENV,
      actor: { kind: "platform_admin", id: ctx.authUserId },
      persist: async (tokenHash) => {
        const { data: tenantId, error } = await ctx.supabase.rpc("platform_create_tenant", {
          p_display_name: v.displayName,
          p_subdomain: v.subdomain,
          p_state: v.initialState,
          p_manager_email: v.managerEmail,
          p_token_hash: tokenHash,
        });
        if (error || !tenantId) throw new RpcError(error ? toErrorCode(error) : "generic");
        const { data: inv } = await getSupabaseAdmin().from("staff_invitations").select("id").eq("tenant_id", tenantId).single();
        return { invitationId: inv?.id ?? tenantId, tenantId };
      },
    });
    if (!r.tenantId) return { error: "generic" };
    created = { tenantId: r.tenantId, delivered: r.delivered };
  } catch (e) {
    const code = codeOf(e);
    // map to the field the user can fix; the rest shows as a form-level message
    if (code === "subdomain_taken" || code === "subdomain_reserved" || code === "subdomain_invalid") return { fieldErrors: { subdomain: code } };
    if (code === "name_required") return { fieldErrors: { displayName: code } };
    if (code === "email_invalid" || code === "email_unavailable") return { fieldErrors: { managerEmail: code } };
    return { error: code };
  }
  redirect(`/tenants/${created.tenantId}${created.delivered ? "" : "?invite=failed"}`);
}
