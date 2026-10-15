"use server";

import { revalidatePath } from "next/cache";
import { resendStaffInvitation } from "@workspace/auth/server";
import { requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { getMailContext } from "@/lib/mail-context";
import { requireTenant } from "@/lib/tenant-context";
import { RpcError, toErrorCodeOrGeneric } from "../staff/rpc";
import type { FormState } from "../form-state";

/** Manager only. The database enforces the 15-minute cooldown and the 5-per-24h cap; there is no cancel action. */
export async function resendInvitationAction(invitationId: string): Promise<FormState> {
  const ctx = await requireManager();
  const tenant = await requireTenant();
  const { locale } = await getI18n();
  const mail = getMailContext();
  try {
    const r = await resendStaffInvitation({
      tenant: { id: tenant.id, displayName: tenant.displayName, subdomain: tenant.subdomain },
      invitationId, locale, mailer: mail.mailer, portalBaseDomain: mail.portalBaseDomain, appEnv: mail.appEnv,
      actor: { kind: "staff", staffId: ctx.staffId },
      persist: async (tokenHash) => {
        const { data, error } = await ctx.supabase.rpc("resend_staff_invitation", { p_invitation_id: invitationId, p_token_hash: tokenHash });
        if (error || !data) throw new RpcError(error ?? { message: "generic" });
        return data;
      },
    });
    revalidatePath("/settings/staff/invitations");
    return r.delivered ? { ok: true } : { ok: true, notice: "invitation_not_delivered" };
  } catch (e) {
    revalidatePath("/settings/staff/invitations");
    return { error: toErrorCodeOrGeneric(e) };
  }
}
