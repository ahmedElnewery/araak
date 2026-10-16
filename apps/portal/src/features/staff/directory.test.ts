import { describe, expect, it } from "vitest";
import { applyStaffFilters, parseStaffFilters, staffQuery, type DirectoryRow } from "./directory";

const row = (over: Partial<DirectoryRow>): DirectoryRow => ({
  id: over.username ?? "x", username: "x", firstName: null, lastName: null, email: "x@example.org", enabled: true, isManager: false, roles: [], ...over,
});
const rows = [
  row({ username: "sara.m", firstName: "سارة", lastName: "محمود", email: "sara@example.org" }),
  row({ username: "khaled", firstName: "Khaled", lastName: "Omar", enabled: false }),
  row({ username: "amira", email: "amira@hope.org" }),
];

describe("staff directory filters", () => {
  it("keeps a trimmed bounded search, a known state and the order", () => {
    expect(parseStaffFilters({ q: "  sara ", state: "enabled", dir: "desc" })).toEqual({ q: "sara", state: "enabled", dir: "desc" });
    expect(parseStaffFilters({ q: "   ", state: "everyone", dir: "sideways" })).toEqual({ q: null, state: null, dir: "asc" });
    expect(parseStaffFilters({ q: "a".repeat(300) }).q).toHaveLength(100);
  });
  it("round-trips through the query string, ascending being the default", () => {
    const f = parseStaffFilters({ q: "a b", state: "disabled", dir: "desc" });
    expect(staffQuery(f)).toBe("?q=a+b&state=disabled&dir=desc");
    expect(staffQuery(f, { dir: "asc", q: null })).toBe("?state=disabled");
    expect(staffQuery(parseStaffFilters({}))).toBe("");
  });
  it("searches the shown name, username and email, ignoring case", () => {
    const names = (q: string) => applyStaffFilters(rows, parseStaffFilters({ q }), "en").map((r) => r.username);
    expect(names("KHALED OMAR")).toEqual(["khaled"]);
    expect(names("hope.org")).toEqual(["amira"]);
    expect(names("محمود")).toEqual(["sara.m"]);
  });
  it("narrows by state and orders by the shown name in both directions", () => {
    expect(applyStaffFilters(rows, parseStaffFilters({ state: "disabled" }), "en").map((r) => r.username)).toEqual(["khaled"]);
    const asc = applyStaffFilters(rows, parseStaffFilters({}), "en").map((r) => r.username);
    expect(applyStaffFilters(rows, parseStaffFilters({ dir: "desc" }), "en").map((r) => r.username)).toEqual([...asc].reverse());
  });
});
