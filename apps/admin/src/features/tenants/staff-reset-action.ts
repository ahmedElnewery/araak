"use server";

import { z } from "zod";
import {
  confirmOwnPassword, createMailer, generateToken, getSupabaseAdmin, hashToken, mailResetLink,
} from "@workspace/auth/server";
import { getServerEnv } from "@workspace/config/server";
import { getI18n } from "@/lib/locale";
import { requirePlatformAdmin } from "@/lib/platform-guards";
import { RpcError, codeOf, toErrorCode } from "@/lib/rpc-error";
import type { FormState } from "../form-state";

const id = z.uuid();

/**
 * Platform-assisted reset, mirroring the manager variant (CL-015, Constitution III): needs `tenants.staff.manage`, the
 * platform admin's OWN password (verified with a throwaway client whose session is ended at once), and sends the link
 * to the employee only. The platform admin never sees or chooses the employee's password.
 * GATE-RBAC closed: the owner approved this platform variant.
 */
export async function platformResetStaffAction(tenantId: string, staffId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformAdmin("tenants.staff.manage");
  if (!id.safeParse(tenantId).success || !id.safeParse(staffId).success) return { error: "staff_not_found" };
  const password = typeof formData.get("adminPassword") === "string" ? (formData.get("adminPassword") as string) : "";
  if (!password) return { fieldErrors: { adminPassword: "confirmation_required" } };

  const admin = getSupabaseAdmin();
  const { data: user } = await admin.auth.admin.getUserById(ctx.authUserId);
  const email = user.user?.email;
  if (!email || !(await confirmOwnPassword({ email, password, authUserId: ctx.authUserId }))) {
    return { fieldErrors: { adminPassword: "confirmation_required" } };
  }
  const { data: tenant } = await admin.from("tenants").select("display_name, subdomain").eq("id", tenantId).maybeSingle();
  const { data: target } = await admin.from("tenant_staff").select("id").eq("id", staffId).eq("tenant_id", tenantId).maybeSingle();
  if (!tenant || !target) return { error: "staff_not_found" };

  const token = generateToken();
  try {
    const { data: to, error } = await ctx.supabase.rpc("platform_request_staff_reset", {
      p_target_staff_id: staffId, p_token_hash: hashToken(token),
    });
    if (error || !to) throw new RpcError(error ? toErrorCode(error) : "generic");
    const env = getServerEnv("admin");
    const { locale } = await getI18n();
    const delivered = await mailResetLink({
      mailer: createMailer(env), to, locale, appEnv: env.APP_ENV, portalBaseDomain: env.PORTAL_BASE_DOMAIN,
      tenant: { displayName: tenant.display_name, subdomain: tenant.subdomain }, token,
    });
    return delivered ? { ok: true } : { ok: true, notice: "invitation_not_delivered" };
  } catch (e) {
    return { error: codeOf(e) };
  }
}
