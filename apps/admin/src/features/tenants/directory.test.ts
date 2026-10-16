import { describe, expect, it } from "vitest";
import { applyTenantFilters, parseTenantFilters, tenantQuery, type TenantRow } from "./directory";

const row = (over: Partial<TenantRow>): TenantRow => ({
  id: over.subdomain ?? "x", display_name: "Org", subdomain: "org", state: "active", created_at: "2026-01-01", ...over,
});
const rows = [
  row({ display_name: "مؤسسة الأمل", subdomain: "amal" }),
  row({ display_name: "Hope Charity", subdomain: "hope", state: "suspended" }),
  row({ display_name: "Beacon", subdomain: "north-beacon" }),
];

describe("tenant directory filters", () => {
  it("keeps a trimmed bounded search, a known state and the order", () => {
    expect(parseTenantFilters({ q: "  hope ", state: "suspended", dir: "desc" })).toEqual({ q: "hope", state: "suspended", dir: "desc" });
    expect(parseTenantFilters({ q: "   ", state: "everyone", dir: "sideways" })).toEqual({ q: null, state: null, dir: "asc" });
    expect(parseTenantFilters({ q: "a".repeat(300) }).q).toHaveLength(100);
  });
  it("round-trips through the query string, ascending being the default", () => {
    const f = parseTenantFilters({ q: "a b", state: "active", dir: "desc" });
    expect(tenantQuery(f)).toBe("?q=a+b&state=active&dir=desc");
    expect(tenantQuery(f, { dir: "asc", q: null })).toBe("?state=active");
    expect(tenantQuery(parseTenantFilters({}))).toBe("");
  });
  it("searches the name and the subdomain, ignoring case", () => {
    const names = (q: string) => applyTenantFilters(rows, parseTenantFilters({ q }), "en").map((r) => r.subdomain);
    expect(names("HOPE")).toEqual(["hope"]);
    expect(names("beacon")).toEqual(["north-beacon"]);
    expect(names("الأمل")).toEqual(["amal"]);
  });
  it("narrows by state and orders by name in both directions", () => {
    expect(applyTenantFilters(rows, parseTenantFilters({ state: "suspended" }), "en").map((r) => r.subdomain)).toEqual(["hope"]);
    const asc = applyTenantFilters(rows, parseTenantFilters({}), "en").map((r) => r.subdomain);
    expect(applyTenantFilters(rows, parseTenantFilters({ dir: "desc" }), "en").map((r) => r.subdomain)).toEqual([...asc].reverse());
  });
});
