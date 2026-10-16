import { describe, expect, it } from "vitest";
import { AUDIT_CATEGORIES, isAuditCategory, isSecurityEventType, SECURITY_EVENT_TYPES } from "./audit-categories";

describe("audit catalog", () => {
  it("has the five approved administrative categories and no tenant lifecycle category", () => {
    expect(AUDIT_CATEGORIES).toEqual(["staff", "invitations", "roles", "tenant_settings", "sessions"]);
    expect(isAuditCategory("tenant_lifecycle")).toBe(false);
  });
  it("recognises only approved Security Log event types", () => {
    expect(SECURITY_EVENT_TYPES).toContain("auth.sign_in_failed");
    expect(SECURITY_EVENT_TYPES).toContain("session.invalid_reuse");
    expect(isSecurityEventType("auth.login_failed")).toBe(false);
    expect(isSecurityEventType("staff.disabled")).toBe(false);
  });
});
