import { describe, expect, it } from "vitest";
import { renderPasswordReset } from "./templates/password-reset";
import { renderPlatformInvitation } from "./templates/platform-invitation";
import { renderStaffInvitation } from "./templates/staff-invitation";

const link = "https://a.portal.example.org/invite/accept?token=abc";

describe("email templates", () => {
  it("staff invitation shows only the tenant name, in both locales, with no provider branding", () => {
    for (const locale of ["ar", "en"] as const) {
      const r = renderStaffInvitation(locale, { tenantName: "Hope Org", link, validHours: 168 });
      expect(r.subject).toContain("Hope Org");
      expect(r.html).toContain(link);
      expect(`${r.subject}${r.text}${r.html}`).not.toMatch(/powered by|erak|إراك/i);
    }
    expect(renderStaffInvitation("ar", { tenantName: "x", link, validHours: 168 }).html).toContain('dir="rtl"');
    expect(renderStaffInvitation("en", { tenantName: "x", link, validHours: 168 }).html).toContain('dir="ltr"');
  });
  it("escapes a hostile tenant name in HTML", () => {
    const r = renderStaffInvitation("en", { tenantName: '<script>alert(1)</script>', link, validHours: 168 });
    expect(r.html).not.toContain("<script>");
  });
  it("platform invitation is neutral (no tenant, no product)", () => {
    const r = renderPlatformInvitation("en", { link, validHours: 23 });
    expect(`${r.subject}${r.text}`).not.toMatch(/tenant|powered/i);
  });
  it("password reset names the tenant and its validity", () => {
    expect(renderPasswordReset("en", { tenantName: "Hope Org", link, validMinutes: 60 }).text).toContain("60 minutes");
  });
});
