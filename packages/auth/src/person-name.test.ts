import { describe, expect, it } from "vitest";
import { PERSON_NAME_MAX, validatePersonName } from "./person-name";

describe("validatePersonName", () => {
  it("trims, collapses inner spaces and accepts Arabic and Latin names", () => {
    expect(validatePersonName("  أحمد  ")).toEqual({ ok: true, value: "أحمد" });
    expect(validatePersonName("عبد   الله")).toEqual({ ok: true, value: "عبد الله" });
    expect(validatePersonName("O'Neil").ok).toBe(true);
    expect(validatePersonName("Jean-Luc").ok).toBe(true);
    expect(validatePersonName("St. John").ok).toBe(true);
    expect(validatePersonName("Zoë").ok).toBe(true);
  });
  it("requires a value", () => {
    expect(validatePersonName("")).toEqual({ ok: false, code: "required" });
    expect(validatePersonName("   ")).toEqual({ ok: false, code: "required" });
  });
  it("rejects digits, markup, leading punctuation and over-long names", () => {
    expect(validatePersonName("Ahmed1")).toEqual({ ok: false, code: "invalid" });
    expect(validatePersonName("<b>")).toEqual({ ok: false, code: "invalid" });
    expect(validatePersonName("-Ali")).toEqual({ ok: false, code: "invalid" });
    expect(validatePersonName("a".repeat(PERSON_NAME_MAX + 1))).toEqual({ ok: false, code: "invalid" });
    expect(validatePersonName("a".repeat(PERSON_NAME_MAX)).ok).toBe(true);
  });
});
