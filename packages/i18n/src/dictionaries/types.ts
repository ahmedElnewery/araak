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
    nav: { tenants: string; admins: string; menu: string; brand: string };
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
      logoTitle: string; logoHint: string; noLogo: string; uploadLogo: string; removeLogo: string; logoSaved: string;
    };
    managers: {
      title: string; active: string; pending: string; none: string; staffMember: string; selectStaff: string;
      promote: string; promoted: string; revoke: string; revoked: string; confirmRevoke: string; revokeTitle: string;
      revokeBody: string; inviteEmail: string; invite: string; invited: string; expires: string;
    };
    staff: {
      title: string; intro: string; none: string; name: string; email: string; status: string; enabled: string;
      disabled: string; manager: string; resetPassword: string; resetTitle: string; resetIntro: string;
      adminPassword: string; confirmReset: string; resetSent: string; resetNotDelivered: string;
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
      password_policy: string; password_mismatch: string; not_authorized: string; confirmation_required: string;
      recovery_rate_limited: string; name_invalid: string; logo_type: string; logo_mismatch: string;
      logo_too_large: string; logo_corrupt: string; logo_dimensions: string; logo_invalid: string; generic: string;
    };
  };
  username: {
    label: string; hint: string; errorLength: string; errorCharset: string; errorPlacement: string;
  };
  personName: { firstName: string; lastName: string; hint: string };
  portal: {
    nav: {
      menu: string; home: string; inviteStaff: string; invitations: string; account: string; signOut: string;
      settings: string; staff: string; roles: string; branding: string; auditLog: string; securityLogs: string;
      settingsMenu: string;
    };
    home: { welcome: string; intro: string };
    branding: {
      title: string; intro: string; nameLabel: string; logoLabel: string; logoHint: string; currentLogo: string;
      noLogo: string; remove: string; save: string; saved: string; removeLogo: string;
    };
    auth: {
      title: string; identifier: string; password: string; signIn: string;
      showPassword: string; hidePassword: string;
      invalidCredentials: string; forgotPassword: string; sessionExpired: string;
    };
    invite: {
      acceptTitle: string; acceptIntro: string; email: string; password: string; confirmPassword: string;
      activate: string; invalidTitle: string; invalidBody: string;
    };
    recovery: {
      requestTitle: string; requestIntro: string; identifier: string; send: string; neutral: string; backToSignIn: string;
      completeTitle: string; completeIntro: string; newPassword: string; confirmPassword: string; submit: string;
      invalidTitle: string; invalidBody: string; retryNeeded: string; done: string;
    };
    staff: {
      inviteTitle: string; email: string; roles: string; noRoles: string; send: string; invited: string;
      invitationNotDelivered: string; pendingTitle: string; pendingEmpty: string; colEmail: string; colRoles: string;
      colExpires: string; colStatus: string; statusPending: string; statusExpired: string; resend: string;
      resendAvailableAt: string; resendNotAvailable: string; resent: string; noCancelNote: string; resetPassword: string;
      resetTitle: string; resetIntro: string; managerPassword: string; confirmReset: string; resetSent: string; resetNotDelivered: string;
      cancel: string;
      directoryTitle: string; colName: string; colState: string; stateEnabled: string; stateDisabled: string;
      managerBadge: string; noStaff: string; open: string; back: string; pendingLink: string; noRolesAssigned: string; username: string;
      rolesEditorTitle: string; rolesEditorIntro: string; saveRoles: string; rolesSaved: string; ownRolesNote: string;
      noAssignableRoles: string; disable: string; enable: string; disableTitle: string; disableBody: string;
      enableTitle: string; enableBody: string; confirm: string; disabled: string; enabled: string;
    };
    roles: {
      title: string; intro: string; tabActive: string; tabArchived: string; new: string; newTitle: string; editTitle: string;
      name: string; description: string; permissions: string; save: string; saved: string; created: string; archive: string;
      restore: string; archived: string; restored: string; empty: string; emptyArchived: string; members: string;
      heldNote: string; archiveTitle: string; archiveBody: string; restoreTitle: string; restoreBody: string; back: string;
      extraNote: string; noSwitches: string; open: string; view: string;
      switches: { viewStaff: string; manageStaff: string; manageRoles: string; viewAudit: string };
      switchHints: { viewStaff: string; manageStaff: string; manageRoles: string; viewAudit: string };
    };
    account: {
      title: string; username: string; changeUsername: string; save: string; saved: string; email: string;
      emailImmutable: string; sessionsLink: string; passwordLink: string;
      changeName: string; nameMissing: string; saveName: string; nameSaved: string;
    };
    sessions: {
      title: string; intro: string; empty: string; colDevice: string; colBrowser: string; colSignedIn: string;
      colActivity: string; current: string; unknownDevice: string; unknownBrowser: string; logout: string;
      logoutAll: string; confirmTitle: string; confirmBody: string; confirm: string; cancel: string;
      confirmAllTitle: string; confirmAllBody: string; confirmAll: string; revoked: string; allRevoked: string;
      deviceTypes: Record<string, string>;
    };
    password: {
      title: string; intro: string; current: string; new: string; confirm: string; submit: string; done: string;
      wrongCurrent: string; signInAgain: string;
    };
    errors: {
      email_invalid: string; email_unavailable: string; role_not_grantable: string; username_invalid: string;
      username_taken: string; invitation_invalid: string; resend_cooldown: string; resend_cap_reached: string;
      invitation_not_found: string; invitation_not_pending: string; confirmation_required: string;
      recovery_rate_limited: string; cannot_reset_self: string; staff_not_found: string; staff_not_eligible: string;
      password_policy: string; password_mismatch: string; not_authorized: string; invalid_credentials: string;
      name_required: string; name_invalid: string; logo_type: string; logo_mismatch: string; logo_too_large: string;
      logo_corrupt: string; logo_dimensions: string; logo_invalid: string;
      role_name_conflict: string; role_name_invalid: string; role_assigned: string; role_self_edit: string;
      role_not_found: string; privilege_escalation: string; grants_invalid: string; cannot_change_own_roles: string;
      cannot_disable_self: string; manager_protected: string; last_active_manager: string; roles_invalid: string;
      session_not_found: string; first_name_required: string; first_name_invalid: string; last_name_required: string;
      last_name_invalid: string; generic: string;
    };
  };
};
