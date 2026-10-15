import "server-only";
import type { Mailer } from "../../email/mailer";
import { renderStaffInvitation } from "../../email/templates/staff-invitation";
import type { Locale } from "../../email/templates/shared";
import { generateToken, hashToken } from "../../tokens";
import { recordTenantAudit } from "../audit";
import { buildStaffInvitationLink } from "./link";

export type IssueInvitationInput = {
  /** `id` may be unknown before persisting (tenant creation); `persist` then returns it. */
  tenant: { id?: string; displayName: string; subdomain: string };
  recipientEmail: string;
  locale: Locale;
  /** The authorized RPC/closure that persists the invitation for the given token hash and returns its id. */
  persist: (tokenHash: string) => Promise<string | { invitationId: string; tenantId: string }>;
  mailer: Mailer;
  portalBaseDomain: string;
  appEnv: "development" | "production" | "test";
  actor: { kind: "staff"; staffId: string } | { kind: "platform_admin"; id: string };
};

/**
 * Shared by both apps. The raw token exists only in memory and in the email; the database sees its SHA-256 hash.
 * A delivery failure is audited WITHOUT the token and leaves the invitation valid for an authorized resend (FR-009).
 */
export async function issueStaffInvitation(input: IssueInvitationInput): Promise<{ invitationId: string; tenantId: string | undefined; delivered: boolean }> {
  const token = generateToken();
  const persisted = await input.persist(hashToken(token));
  const invitationId = typeof persisted === "string" ? persisted : persisted.invitationId;
  const tenantId = typeof persisted === "string" ? input.tenant.id : persisted.tenantId;
  const link = buildStaffInvitationLink({
    appEnv: input.appEnv, subdomain: input.tenant.subdomain, portalBaseDomain: input.portalBaseDomain, token,
  });
  const mail = renderStaffInvitation(input.locale, { tenantName: input.tenant.displayName, link, validHours: 168 });
  try {
    await input.mailer.send({ to: input.recipientEmail, ...mail });
    return { invitationId, tenantId, delivered: true };
  } catch {
    if (!tenantId) return { invitationId, tenantId, delivered: false };
    await recordTenantAudit({
      tenantId,
      actor: input.actor,
      category: "invitations",
      event: "invitation.delivery_failed",
      resourceType: "staff_invitation",
      resourceId: invitationId,
    });
    return { invitationId, tenantId, delivered: false };
  }
}
