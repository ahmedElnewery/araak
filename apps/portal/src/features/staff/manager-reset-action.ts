"use server";

import { confirmOwnPassword, generateToken, hashToken, mailResetLink } from "@workspace/auth/server";
import { requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { getMailContext } from "@/lib/mail-context";
import { requireTenant } from "@/lib/tenant-context";
import { field, type FormState } from "../form-state";
import { RpcError, toErrorCodeOrGeneric } from "./rpc";

/**
 * Manager-assisted reset (CL-015): the MANAGER's own password is verified, a 120 s single-use confirmation is
 * recorded, then the database issues a 60-minute link that is mailed to the EMPLOYEE only. The manager never sees
 * or chooses the employee's password.
 */
export async function managerResetAction(targetStaffId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireManager();
  const tenant = await requireTenant();
  const password = field(formData, "managerPassword");
  if (!password) return { fieldErrors: { managerPassword: "confirmation_required" } };
  const ok = await confirmOwnPassword({ email: ctx.email, password, authUserId: ctx.authUserId });
  if (!ok) return { fieldErrors: { managerPassword: "confirmation_required" } };
  const token = generateToken();
  try {
    const { data: email, error } = await ctx.supabase.rpc("request_manager_assisted_reset", {
      p_target_staff_id: targetStaffId, p_token_hash: hashToken(token),
    });
    if (error || !email) throw new RpcError(error ?? { message: "generic" });
    const { locale } = await getI18n();
    const mail = getMailContext();
    const delivered = await mailResetLink({
      mailer: mail.mailer, to: email, locale, appEnv: mail.appEnv, portalBaseDomain: mail.portalBaseDomain,
      tenant: { displayName: tenant.displayName, subdomain: tenant.subdomain }, token,
    });
    return delivered ? { ok: true } : { ok: true, notice: "reset_not_delivered" };
  } catch (e) {
    return { error: toErrorCodeOrGeneric(e) };
  }
}
