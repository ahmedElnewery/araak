import "server-only";

/** Staff invitation link on the tenant's own host. The raw token only ever appears here and in the email. */
export function buildStaffInvitationLink(args: {
  appEnv: "development" | "production" | "test"; subdomain: string; portalBaseDomain: string; token: string;
}): string {
  const scheme = args.appEnv === "development" ? "http" : "https";
  return `${scheme}://${args.subdomain}.${args.portalBaseDomain}/invite/accept?token=${args.token}`;
}

export function buildRecoveryLink(args: {
  appEnv: "development" | "production" | "test"; subdomain: string; portalBaseDomain: string; token: string;
}): string {
  const scheme = args.appEnv === "development" ? "http" : "https";
  return `${scheme}://${args.subdomain}.${args.portalBaseDomain}/recover/complete?token=${args.token}`;
}
