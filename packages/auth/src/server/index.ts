import "server-only";

export { AuthError, type AuthErrorCode } from "../errors";
export { createSupabaseServerClient, type AppName, type ServerClient } from "./supabase";
export { getSupabaseAdmin, type AdminClient } from "./supabase-admin";
export { recordMeaningfulActivity, isMeaningfulRequest, type ActivityRequest } from "./activity";
export { changeOwnPassword, type ChangePasswordResult } from "./password";
export { registerSession, revokeSessions, describeDevice, type SessionOwner, type RevokeFilter, type RevokeReason } from "./session-registry";
export { getTenantStaffContext, getPlatformAdminContext, type TenantStaffContext, type PlatformAdminContext, type HostTenant } from "./context";
export { recordTenantAudit, recordSecurityEvent, recordPlatformAudit } from "./audit";
export { issueStaffInvitation, type IssueInvitationInput } from "./invitations/issue";
export { issuePlatformInvitation, type IssuePlatformInvitationInput } from "./invitations/platform";
export { createMailer, SmtpMailer, UnconfiguredProductionMailer, type Mailer, type MailMessage } from "../email/mailer";
export { renderStaffInvitation } from "../email/templates/staff-invitation";
export { renderPlatformInvitation } from "../email/templates/platform-invitation";
export { renderPasswordReset } from "../email/templates/password-reset";
export { generateToken, hashToken, timingSafeEqualHex } from "../tokens";
export { getClientIp, throttleHmac, normalizeIdentifier } from "./client-ip";
export { buildThrottleKeys, checkAndRecordAttempt, recordAuthSuccess, type ThrottleKeys, type ThrottleKind } from "./throttle";
export { padFailedSignIn, TIMING_PAD_EMAIL } from "./timing-pad";
export { buildStaffInvitationLink, buildRecoveryLink } from "./invitations/link";
export { resendStaffInvitation, type ResendInvitationInput } from "./invitations/resend";
export { signInTenantStaff, type TenantSignInInput, type TenantSignInResult } from "./sign-in";
export {
  requestSelfServiceRecovery, mailResetLink, peekRecovery, redeemRecovery, confirmOwnPassword,
  type SelfServiceRecoveryInput, type RedeemRecoveryResult,
} from "./recovery";
