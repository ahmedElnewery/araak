import "server-only";
import { z } from "zod";

export { logger, redact } from "../logger";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  APP_ENV: z.enum(["development", "production", "test"]),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  AUTH_THROTTLE_HMAC_KEY: z.string().min(32),
  SMTP_URL: z.string().optional(),
  PORTAL_BASE_DOMAIN: z.string().min(1).optional(),
  ADMIN_HOST: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema> & { PORTAL_BASE_DOMAIN: string; ADMIN_HOST: string };
export type AppName = "portal" | "admin";

let cached: Partial<Record<AppName, ServerEnv>> = {};

/**
 * Validated server env, read lazily (so `next build` does not need secrets) and fail-fast at first use.
 * Both apps require PORTAL_BASE_DOMAIN (the admin app mails invitation and reset links to tenant portals); the admin
 * app also requires ADMIN_HOST.
 */
export function getServerEnv(app: AppName, source: Record<string, string | undefined> = process.env): ServerEnv {
  const hit = cached[app];
  if (hit && source === process.env) return hit;
  const parsed = serverSchema.parse(source);
  const missing = [
    ...(parsed.PORTAL_BASE_DOMAIN ? [] : ["PORTAL_BASE_DOMAIN"]),
    ...(app === "admin" && !parsed.ADMIN_HOST ? ["ADMIN_HOST"] : []),
  ];
  if (missing.length > 0) throw new Error(`${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} required for the ${app} app`);
  const env = { ...parsed, PORTAL_BASE_DOMAIN: parsed.PORTAL_BASE_DOMAIN ?? "", ADMIN_HOST: parsed.ADMIN_HOST ?? "" };
  if (source === process.env) cached = { ...cached, [app]: env };
  return env;
}
export { processLogo, sniffLogoMime, type ProcessedLogo, type LogoResult } from "./logo";
