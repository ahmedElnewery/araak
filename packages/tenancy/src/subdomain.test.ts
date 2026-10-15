import { describe, expect, it } from "vitest";
import { validateSubdomain } from "./subdomain";

describe("validateSubdomain", () => {
  it.each(["a", "tenant-a", "a1", "abc-123", "x".repeat(63)])("accepts %s", (s) => {
    expect(validateSubdomain(s)).toEqual({ ok: true });
  });
  it.each(["", "-a", "a-", "A", "Tenant", "a.b", "a_b", "x".repeat(64), "اختبار", "a b"])("rejects %j as invalid", (s) => {
    expect(validateSubdomain(s)).toEqual({ ok: false, reason: "invalid" });
  });
  it.each(["admin", "www", "api", "app", "mail", "smtp", "auth", "static", "assets", "portal", "status", "support"])(
    "rejects reserved name %s",
    (s) => {
      expect(validateSubdomain(s)).toEqual({ ok: false, reason: "reserved" });
    },
  );
});
