import { describe, expect, it } from "vitest";
import { getServerEnv } from "./index";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxx",
  SUPABASE_SECRET_KEY: "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx",
  APP_ENV: "test",
  AUTH_THROTTLE_HMAC_KEY: "x".repeat(32),
};

describe("getServerEnv", () => {
  it("accepts a complete portal env and defaults proxy hops to 0", () => {
    const env = getServerEnv("portal", { ...base, PORTAL_BASE_DOMAIN: "portal.localhost:3000" });
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
    expect(env.PORTAL_BASE_DOMAIN).toBe("portal.localhost:3000");
  });
  it("fails fast when a required value is missing or invalid", () => {
    expect(() => getServerEnv("portal", { ...base, PORTAL_BASE_DOMAIN: "p" , SUPABASE_SECRET_KEY: undefined })).toThrow();
    expect(() => getServerEnv("portal", { ...base, PORTAL_BASE_DOMAIN: "p", APP_ENV: "ci" })).toThrow();
    expect(() => getServerEnv("portal", { ...base, PORTAL_BASE_DOMAIN: "p", AUTH_THROTTLE_HMAC_KEY: "short" })).toThrow();
    expect(() => getServerEnv("portal", { ...base, PORTAL_BASE_DOMAIN: "p", TRUSTED_PROXY_HOPS: "-1" })).toThrow();
  });
  it("requires the app-specific host variable", () => {
    expect(() => getServerEnv("portal", base)).toThrow(/PORTAL_BASE_DOMAIN/);
    expect(() => getServerEnv("admin", base)).toThrow(/ADMIN_HOST/);
    expect(getServerEnv("admin", { ...base, ADMIN_HOST: "admin.localhost:3001" }).ADMIN_HOST).toBe("admin.localhost:3001");
  });
});
