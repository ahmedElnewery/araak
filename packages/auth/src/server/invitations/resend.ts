import "server-only";
import type { Mailer } from "../../email/mailer";
import { renderStaffInvitation } from "../../email/templates/staff-invitation";
import type { Locale } from "../../email/templates/shared";
import { generateToken, hashToken } from "../../tokens";
import { recordTenantAudit } from "../audit";
import { buildStaffInvitationLink } from "./link";

export type ResendInvitationInput = {
  tenant: { id: string; displayName: string; subdomain: string };
  invitationId: string;
  locale: Locale;
  /** The authorized RPC that enforces cooldown/cap, supersedes older links and returns the recipient address. */
  persist: (tokenHash: string) => Promise<string>;
  mailer: Mailer;
  portalBaseDomain: string;
  appEnv: "development" | "production" | "test";
  actor: { kind: "staff"; staffId: string } | { kind: "platform_admin"; id: string };
};

/** A denial throws from `persist` before anything is mailed. A delivery failure keeps the new link valid and is audited. */
export async function resendStaffInvitation(input: ResendInvitationInput): Promise<{ delivered: boolean }> {
  const token = generateToken();
  const recipient = await input.persist(hashToken(token));
  const link = buildStaffInvitationLink({
    appEnv: input.appEnv, subdomain: input.tenant.subdomain, portalBaseDomain: input.portalBaseDomain, token,
  });
  const mail = renderStaffInvitation(input.locale, { tenantName: input.tenant.displayName, link, validHours: 168 });
  try {
    await input.mailer.send({ to: recipient, ...mail });
    return { delivered: true };
  } catch {
    await recordTenantAudit({
      tenantId: input.tenant.id, actor: input.actor, category: "invitations", event: "invitation.delivery_failed",
      resourceType: "staff_invitation", resourceId: input.invitationId,
    }).catch(() => undefined);
    return { delivered: false };
  }
}
