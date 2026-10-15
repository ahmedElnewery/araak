/** Every user-facing string of the foundation shell. Both locales must provide every key (dictionaries.test.ts). */
export type Dictionary = {
  common: {
    skipToContent: string;
    language: string;
    theme: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    loading: string;
    retry: string;
    openMenu: string;
    closeMenu: string;
    logoAlt: string;
  };
  errors: {
    notFoundTitle: string;
    notFoundBody: string;
    genericTitle: string;
    genericBody: string;
    forbiddenTitle: string;
    forbiddenBody: string;
    sessionExpiredTitle: string;
    sessionExpiredBody: string;
    suspendedTitle: string;
    suspendedBody: string;
  };
  nav: {
    home: string;
  };
  admin: {
    nav: { tenants: string; admins: string; menu: string };
    common: { cancel: string; created: string; state: string; actions: string; none: string; back: string };
    auth: {
      title: string; email: string; password: string; confirmPassword: string; signIn: string; signOut: string;
      invalidCredentials: string; rateLimited: string;
    };
    tenants: {
      title: string; new: string; newTitle: string; empty: string; displayName: string; subdomain: string;
      subdomainHint: string; subdomainReadOnly: string; initialState: string; managerEmail: string; create: string;
      saveName: string; nameSaved: string; stateActive: string; stateSuspended: string; suspend: string;
      reactivate: string; confirmSuspend: string; confirmReactivate: string; suspendTitle: string;
      suspendBody: string; reactivateTitle: string; reactivateBody: string; invitationNotDelivered: string;
      stateSaved: string; detailsTitle: string;
    };
    managers: {
      title: string; active: string; pending: string; none: string; staffMember: string; selectStaff: string;
      promote: string; promoted: string; revoke: string; revoked: string; confirmRevoke: string; revokeTitle: string;
      revokeBody: string; inviteEmail: string; invite: string; invited: string; expires: string;
    };
    admins: {
      title: string; intro: string; invite: string; inviteTitle: string; capabilities: string; sendInvitation: string;
      invitationSent: string; invitationNotDelivered: string; acceptTitle: string; acceptIntro: string; accept: string;
      invitationInvalid: string; noRemoval: string;
    };
    capabilities: {
      "tenants.manage": string; "tenants.managers.manage": string; "tenants.staff.manage": string;
      "platform_admins.invite": string; "platform_audit.view": string;
    };
    errors: {
      name_required: string; subdomain_invalid: string; subdomain_reserved: string; subdomain_taken: string;
      email_invalid: string; email_unavailable: string; last_active_manager: string; staff_not_found: string;
      staff_not_eligible: string; already_manager: string; not_a_manager: string; capabilities_invalid: string;
      capabilities_exceed_inviter: string; tenant_not_found: string; tenant_unavailable: string;
      password_policy: string; password_mismatch: string; not_authorized: string; generic: string;
    };
  };
};
