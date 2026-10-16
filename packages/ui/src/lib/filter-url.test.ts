import { describe, expect, it } from "vitest";
import { filterTarget } from "./filter-url";

const form = (...pairs: [string, string][]) => pairs;

describe("filterTarget", () => {
  it("leaves empty fields out, so nothing chosen is the bare list URL", () => {
    expect(filterTarget("/staff", form(["q", ""], ["state", ""]), "q=ali")).toBe("/staff");
    expect(filterTarget("/staff", form(["q", "  "], ["state", ""]), "state=enabled")).toBe("/staff");
  });
  it("sends only the fields that say something, trimmed", () => {
    expect(filterTarget("/staff", form(["dir", "desc"], ["q", " ali "], ["state", ""]), "")).toBe("/staff?dir=desc&q=ali");
  });
  it("sends nothing when the filters are the ones already open", () => {
    expect(filterTarget("/staff", form(["q", ""], ["state", ""]), "")).toBeNull();
    expect(filterTarget("/staff", form(["q", "ali"], ["state", ""]), "q=ali&state=")).toBeNull();
    expect(filterTarget("/staff", form(["q", "ali"], ["state", "enabled"]), "state=enabled&q=ali")).toBeNull();
  });
  it("still goes when only the page or another parameter differs, which also returns to page one", () => {
    expect(filterTarget("/audit", form(["q", "ali"]), "q=ali&page=3")).toBe("/audit?q=ali");
  });
  it("repeats a multi-value field", () => {
    expect(filterTarget("/audit", form(["category", "staff"], ["category", "roles"]), "")).toBe("/audit?category=staff&category=roles");
  });
});
