import "server-only";
import type { Mailer } from "../../email/mailer";
import { renderPlatformInvitation } from "../../email/templates/platform-invitation";
import type { Locale } from "../../email/templates/shared";
import { generateToken, hashToken } from "../../tokens";

export type IssuePlatformInvitationInput = {
  recipientEmail: string;
  locale: Locale;
  /** The authorized RPC (`platform_invite_admin`) that stores the hash and returns the invitation id. */
  persist: (tokenHash: string) => Promise<string>;
  mailer: Mailer;
  adminHost: string;
  appEnv: "development" | "production" | "test";
};

/** The raw token lives only in memory and in the email; the database sees its SHA-256 hash (24 h, single use). */
export async function issuePlatformInvitation(input: IssuePlatformInvitationInput): Promise<{ invitationId: string; delivered: boolean }> {
  const token = generateToken();
  const invitationId = await input.persist(hashToken(token));
  const scheme = input.appEnv === "development" ? "http" : "https";
  const link = `${scheme}://${input.adminHost}/admins/accept?token=${token}`;
  const mail = renderPlatformInvitation(input.locale, { link, validHours: 24 });
  try {
    await input.mailer.send({ to: input.recipientEmail, ...mail });
    return { invitationId, delivered: true };
  } catch {
    return { invitationId, delivered: false };
  }
}
