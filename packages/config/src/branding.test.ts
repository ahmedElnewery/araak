import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX, isLogoMime, validateDisplayName } from "./branding";

describe("display name", () => {
  it("trims and accepts Arabic, Latin, digits and the allowed punctuation", () => {
    expect(validateDisplayName("  جمعية الأمل  ")).toEqual({ ok: true, value: "جمعية الأمل" });
    expect(validateDisplayName("Hope & Co. (2026), Ltd-1")).toEqual({ ok: true, value: "Hope & Co. (2026), Ltd-1" });
    expect(validateDisplayName("جمعية الأمل، فرع القاهرة").ok).toBe(true); // Arabic comma
  });
  it("rejects empty, markup, control characters and over-long names", () => {
    expect(validateDisplayName("   ")).toEqual({ ok: false, code: "name_required" });
    expect(validateDisplayName("<b>Hope</b>")).toEqual({ ok: false, code: "name_invalid" });
    expect(validateDisplayName("Hope\u0000")).toEqual({ ok: false, code: "name_invalid" });
    expect(validateDisplayName("a".repeat(DISPLAY_NAME_MAX + 1))).toEqual({ ok: false, code: "name_invalid" });
    expect(validateDisplayName("a".repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
  });
});

describe("logo MIME allowlist", () => {
  it("allows PNG, JPEG and WebP only (no SVG)", () => {
    expect(["image/png", "image/jpeg", "image/webp"].every(isLogoMime)).toBe(true);
    expect(isLogoMime("image/svg+xml")).toBe(false);
    expect(isLogoMime("image/gif")).toBe(false);
  });
});
