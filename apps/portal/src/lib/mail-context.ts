import "server-only";
import { createMailer } from "@workspace/auth/server";
import { getServerEnv } from "@workspace/config/server";

/** Validated server env plus the mail transport for this app. */
export function getMailContext() {
  const env = getServerEnv("portal");
  return { env, mailer: createMailer(env), portalBaseDomain: env.PORTAL_BASE_DOMAIN, appEnv: env.APP_ENV };
}
