import { describe, expect, it } from "vitest";
import { isAcceptableEmail, normalizeEmail } from "./normalize";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ahmed@Example.ORG ")).toBe("ahmed@example.org");
  });
  it("keeps dots and plus tags (distinct identities)", () => {
    expect(normalizeEmail("A.b+tag@x.org")).toBe("a.b+tag@x.org");
  });
  it("trims tabs, newlines and non-breaking spaces at the edges only", () => {
    expect(normalizeEmail("\tA@b.c\n")).toBe("a@b.c");
    expect(normalizeEmail("\u00a0A@b.c\ufeff")).toBe("a@b.c");
    expect(normalizeEmail("a b@c.d")).toBe("a b@c.d");
  });
  it("is idempotent", () => {
    const once = normalizeEmail(" X@Y.z ");
    expect(normalizeEmail(once)).toBe(once);
  });
  it("lowercases ASCII only (matches the database, whose lower() is collation dependent)", () => {
    expect(normalizeEmail("\u00c4@X.de")).toBe("\u00c4@x.de");
  });
  it("accepts only printable-ASCII addresses", () => {
    expect(isAcceptableEmail(" Ahmed@Example.org ")).toBe(true);
    for (const bad of ["", "a", "a@", "@b.c", "a@@b.c", "a b@c.d", "\u00e4@b.c", "a@b.c".padEnd(300, "x")]) expect(isAcceptableEmail(bad)).toBe(false);
  });
});
