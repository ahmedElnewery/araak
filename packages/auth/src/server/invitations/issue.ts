import "server-only";
import type { Mailer } from "../../email/mailer";
import { renderStaffInvitation } from "../../email/templates/staff-invitation";
import type { Locale } from "../../email/templates/shared";
import { generateToken, hashToken } from "../../tokens";
import { recordTenantAudit } from "../audit";

export type IssueInvitationInput = {
  tenant: { id: string; displayName: string; subdomain: string };
  recipientEmail: string;
  locale: Locale;
  /** The authorized RPC/closure that persists the invitation for the given token hash and returns its id. */
  persist: (tokenHash: string) => Promise<string>;
  mailer: Mailer;
  portalBaseDomain: string;
  appEnv: "development" | "production" | "test";
  actor: { kind: "staff"; staffId: string } | { kind: "platform_admin"; id: string };
};

/**
 * Shared by both apps. The raw token exists only in memory and in the email; the database sees its SHA-256 hash.
 * A delivery failure is audited WITHOUT the token and leaves the invitation valid for an authorized resend (FR-009).
 */
export async function issueStaffInvitation(input: IssueInvitationInput): Promise<{ invitationId: string; delivered: boolean }> {
  const token = generateToken();
  const invitationId = await input.persist(hashToken(token));
  const scheme = input.appEnv === "development" ? "http" : "https";
  const link = `${scheme}://${input.tenant.subdomain}.${input.portalBaseDomain}/invite/accept?token=${token}`;
  const mail = renderStaffInvitation(input.locale, { tenantName: input.tenant.displayName, link, validHours: 168 });
  try {
    await input.mailer.send({ to: input.recipientEmail, ...mail });
    return { invitationId, delivered: true };
  } catch {
    await recordTenantAudit({
      tenantId: input.tenant.id,
      actor: input.actor,
      category: "invitations",
      event: "invitation.delivery_failed",
      resourceType: "staff_invitation",
      resourceId: invitationId,
    });
    return { invitationId, delivered: false };
  }
}
