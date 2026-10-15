import { describe, expect, it } from "vitest";
import { validateSubdomain } from "./subdomain";

describe("validateSubdomain", () => {
  // `portal` is the Araak organization's label (owner decision 2026-10-15), not a reserved name.
  it.each(["a", "tenant-a", "a1", "abc-123", "x".repeat(63), "portal"])("accepts %s", (s) => {
    expect(validateSubdomain(s)).toEqual({ ok: true });
  });
  it.each(["", "-a", "a-", "A", "Tenant", "a.b", "a_b", "x".repeat(64), "اختبار", "a b"])("rejects %j as invalid", (s) => {
    expect(validateSubdomain(s)).toEqual({ ok: false, reason: "invalid" });
  });
  it.each([
    "admin", "www", "api", "app", "mail", "smtp", "auth", "static", "assets", "status", "support",
    "araak", "send", "email", "docs", "help", "blog", "dev", "staging", "test", "preview",
    "cdn", "id", "login", "account", "dashboard", "billing",
  ])(
    "rejects reserved name %s",
    (s) => {
      expect(validateSubdomain(s)).toEqual({ ok: false, reason: "reserved" });
    },
  );
});
