import "server-only";

export { AuthError, type AuthErrorCode } from "../errors";
export { createSupabaseServerClient, type AppName, type ServerClient } from "./supabase";
export { getSupabaseAdmin, type AdminClient } from "./supabase-admin";
export { registerSession, revokeSessions, describeDevice, type SessionOwner, type RevokeFilter, type RevokeReason } from "./session-registry";
export { getTenantStaffContext, getPlatformAdminContext, type TenantStaffContext, type PlatformAdminContext, type HostTenant } from "./context";
export { recordTenantAudit, recordSecurityEvent, recordPlatformAudit } from "./audit";
export { issueStaffInvitation, type IssueInvitationInput } from "./invitations/issue";
export { createMailer, SmtpMailer, UnconfiguredProductionMailer, type Mailer, type MailMessage } from "../email/mailer";
export { renderStaffInvitation } from "../email/templates/staff-invitation";
export { renderPlatformInvitation } from "../email/templates/platform-invitation";
export { renderPasswordReset } from "../email/templates/password-reset";
export { generateToken, hashToken, timingSafeEqualHex } from "../tokens";
