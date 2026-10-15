"use server";

import { z } from "zod";
import { createMailer, issuePlatformInvitation } from "@workspace/auth/server";
import { PLATFORM_CAPABILITIES } from "@workspace/authorization";
import { getServerEnv } from "@workspace/config/server";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { RpcError, codeOf, toErrorCode } from "@/lib/rpc-error";
import type { FormState } from "../form-state";
import { fieldErrors, inviteEmailSchema } from "../tenants/schema";

/** There is intentionally no action here (or anywhere) that removes, demotes or disables a platform admin (CL-040/041). */
export async function invitePlatformAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformAdmin("platform_admins.invite");
  const parsed = inviteEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const caps = z.array(z.enum(PLATFORM_CAPABILITIES)).min(1).safeParse(formData.getAll("capabilities"));
  if (!caps.success) return { fieldErrors: { capabilities: "capabilities_invalid" } };
  // checkboxes only offer the actor's own capabilities; the database enforces the subset rule regardless
  const env = getServerEnv("admin");
  const { locale } = await getI18n();
  try {
    const r = await issuePlatformInvitation({
      recipientEmail: parsed.data.email,
      locale,
      mailer: createMailer(env),
      adminHost: env.ADMIN_HOST,
      appEnv: env.APP_ENV,
      persist: async (tokenHash) => {
        const { data, error } = await ctx.supabase.rpc("platform_invite_admin", {
          p_email: parsed.data.email, p_capabilities: caps.data, p_token_hash: tokenHash,
        });
        if (error || !data) throw new RpcError(error ? toErrorCode(error) : "generic");
        return data;
      },
    });
    return r.delivered ? { ok: true } : { ok: true, notice: "invitation_not_delivered" };
  } catch (e) {
    const code = codeOf(e);
    if (code === "email_invalid" || code === "email_unavailable") return { fieldErrors: { email: code } };
    if (code === "capabilities_invalid" || code === "capabilities_exceed_inviter") return { fieldErrors: { capabilities: code } };
    return { error: code };
  }
}
