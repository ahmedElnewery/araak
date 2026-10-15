import { describe, expect, it } from "vitest";
import { generateToken, hashToken, timingSafeEqualHex } from "./tokens";

describe("tokens", () => {
  it("generates 32 random bytes as base64url", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(t);
  });
  it("hashes to 64 hex chars deterministically (SHA-256 of the token)", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
  it("compares hashes in constant time and rejects malformed input", () => {
    const h = hashToken("x");
    expect(timingSafeEqualHex(h, hashToken("x"))).toBe(true);
    expect(timingSafeEqualHex(h, hashToken("y"))).toBe(false);
    expect(timingSafeEqualHex(h, h.slice(2))).toBe(false);
    expect(timingSafeEqualHex("zz", "zz")).toBe(false);
  });
});
