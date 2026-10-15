"use server";

import { z } from "zod";
import { isAcceptableEmail } from "@workspace/auth";
import { issueStaffInvitation } from "@workspace/auth/server";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { getMailContext } from "@/lib/mail-context";
import { requireTenant } from "@/lib/tenant-context";
import { RpcError, toErrorCodeOrGeneric } from "./rpc";
import { field, type FormState } from "../form-state";

const roleIds = z.array(z.uuid()).max(50);

/** Authority is re-checked by the database; the form only offers roles the actor may grant (`list_grantable_roles`). */
export async function inviteStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("staff.invite");
  const tenant = await requireTenant();
  const email = field(formData, "email").trim();
  if (!isAcceptableEmail(email)) return { fieldErrors: { email: "email_invalid" } };
  const roles = roleIds.safeParse(formData.getAll("roles").map(String));
  if (!roles.success) return { fieldErrors: { roles: "role_not_grantable" } };
  const { locale } = await getI18n();
  const mail = getMailContext();
  try {
    const r = await issueStaffInvitation({
      tenant: { id: tenant.id, displayName: tenant.displayName, subdomain: tenant.subdomain },
      recipientEmail: email,
      locale,
      mailer: mail.mailer,
      portalBaseDomain: mail.portalBaseDomain,
      appEnv: mail.appEnv,
      actor: { kind: "staff", staffId: ctx.staffId },
      persist: async (tokenHash) => {
        const { data, error } = await ctx.supabase.rpc("invite_staff", { p_email: email, p_role_ids: roles.data, p_token_hash: tokenHash });
        if (error || !data) throw new RpcError(error ? error : { message: "generic" });
        return data;
      },
    });
    return r.delivered ? { ok: true } : { ok: true, notice: "invitation_not_delivered" };
  } catch (e) {
    const code = toErrorCodeOrGeneric(e);
    if (code === "email_invalid" || code === "email_unavailable") return { fieldErrors: { email: code } };
    if (code === "role_not_grantable") return { fieldErrors: { roles: code } };
    return { error: code };
  }
}
