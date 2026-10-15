import { describe, expect, it } from "vitest";
import { usernameErrorKey, validateUsername } from "./username";

describe("validateUsername", () => {
  it.each(["abc", "Ahmed", "ahmed.ali", "ahmed_ali", "a.b.c", "A_b.C", "a".repeat(30)])("accepts %s", (v) => {
    expect(validateUsername(v)).toEqual({ ok: true });
  });
  it.each([["ab", "length"], ["", "length"], ["a".repeat(31), "length"]] as const)("rejects %j: %s", (v, code) => {
    expect(validateUsername(v)).toEqual({ ok: false, code });
  });
  it.each(["ahmed1", "ahmed-ali", "ahmed ali", "أحمد", "ahmed@x", "a1b", "ahmed​"])("rejects the charset of %s", (v) => {
    expect(validateUsername(v)).toEqual({ ok: false, code: "charset" });
  });
  it.each([".ahmed", "ahmed.", "_ahmed", "ahmed_", "ah..med", "ah._med", "ah__med"])("rejects the placement of %s", (v) => {
    expect(validateUsername(v)).toEqual({ ok: false, code: "placement" });
  });
  it("agrees with the reference regex on a sample space", () => {
    const re = /^[A-Za-z]+(?:[._][A-Za-z]+)*$/;
    const alphabet = ["a", "B", ".", "_", "1", "-"];
    const walk = (s: string, depth: number): void => {
      const ref = s.length >= 3 && s.length <= 30 && re.test(s);
      expect(validateUsername(s).ok).toBe(ref);
      if (depth > 0) for (const c of alphabet) walk(s + c, depth - 1);
    };
    walk("", 4);
  });
  it("maps codes to dictionary keys", () => {
    expect(usernameErrorKey("length")).toBe("errorLength");
    expect(usernameErrorKey("charset")).toBe("errorCharset");
    expect(usernameErrorKey("placement")).toBe("errorPlacement");
  });
});
