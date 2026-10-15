import { describe, expect, it } from "vitest";
import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";
import { dir, DEFAULT_LOCALE } from "./config";
import { formatDate, formatNumber } from "./format";
import { resolveLocale } from "./resolve-locale";

const keys = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const values = (o: Record<string, unknown>): string[] =>
  Object.values(o).flatMap((v) => (v && typeof v === "object" ? values(v as Record<string, unknown>) : [String(v)]));

describe("dictionaries", () => {
  it("AR and EN have identical key sets", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
  it("have no empty values", () => {
    for (const d of [ar, en]) for (const v of values(d)) expect(v.trim()).not.toBe("");
  });
  it("Arabic strings are Arabic and English strings are Latin", () => {
    expect(values(ar).every((v) => /[؀-ۿ]/.test(v))).toBe(true);
    expect(values(en).every((v) => /[A-Za-z]/.test(v))).toBe(true);
  });
});

describe("locale helpers", () => {
  it("defaults to Arabic RTL and resolves stored -> cookie -> default", () => {
    expect(DEFAULT_LOCALE).toBe("ar");
    expect(dir("ar")).toBe("rtl");
    expect(dir("en")).toBe("ltr");
    expect(resolveLocale({ stored: "en", cookie: "ar" })).toBe("en");
    expect(resolveLocale({ stored: null, cookie: "en" })).toBe("en");
    expect(resolveLocale({ stored: "fr", cookie: "xx" })).toBe("ar");
    expect(resolveLocale({})).toBe("ar");
  });
  it("formats with an explicit locale and Latin digits", () => {
    expect(formatNumber(1234.5, "ar")).toBe("1,234.5");
    expect(formatDate("2026-10-15T12:00:00Z", "en")).toMatch(/2026/);
    expect(formatDate("2026-10-15T12:00:00Z", "ar")).toMatch(/2026/);
  });
});
