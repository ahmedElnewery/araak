import { describe, expect, it } from "vitest";
import {
  auditQuery, auditRpcFilters, openEventId, pageArgs, parseAuditFilters, parseSecurityFilters, securityQuery, withEventId, PAGE_SIZE,
} from "./filters";

const UUID = "0b0c51c8-2c5c-4a8a-9d4e-1f2a3b4c5d6e";

describe("audit filters", () => {
  it("keeps only approved categories, real dates, uuids and a bounded page", () => {
    const f = parseAuditFilters({
      category: ["staff", "bogus", "staff", "roles"], from: "2026-02-30", to: "2026-10-16", actor: "nope", q: "  x  ", page: "0",
    });
    expect(f).toEqual({ categories: ["staff", "roles"], from: null, to: "2026-10-16", actor: null, q: "x", page: 1 });
    expect(parseAuditFilters({ actor: UUID.toUpperCase(), page: "99999999" })).toMatchObject({ actor: UUID, page: 10_000 });
    expect(parseAuditFilters({ q: "a".repeat(500) }).q).toHaveLength(100);
  });
  it("maps to RPC arguments: whole UTC days, undefined for no filter", () => {
    expect(auditRpcFilters(parseAuditFilters({ from: "2026-01-01", to: "2026-01-31" }))).toEqual({
      p_categories: undefined, p_from: "2026-01-01T00:00:00.000Z", p_to: "2026-01-31T23:59:59.999Z", p_actor: undefined, p_search: undefined,
    });
    expect(pageArgs({ page: 3 })).toEqual({ p_limit: PAGE_SIZE, p_offset: 2 * PAGE_SIZE });
  });
  it("round-trips through the query string and builds detail links", () => {
    const f = parseAuditFilters({ category: ["roles", "staff"], q: "a b", page: "2" });
    const q = auditQuery(f);
    expect(q).toBe("?category=roles&category=staff&q=a+b&page=2");
    expect(parseAuditFilters(Object.fromEntries([...new URLSearchParams(q).keys()].map((k) => [k, new URLSearchParams(q).getAll(k)])))).toEqual(f);
    expect(auditQuery(f, { page: 1, categories: [] })).toBe("?q=a+b");
    expect(withEventId("", 7)).toBe("?event_id=7");
    expect(withEventId(q, 7)).toBe(`${q}&event_id=7`);
    expect(openEventId({ event_id: "12" })).toBe(12);
    expect(openEventId({ event_id: "1e3" })).toBeNull();
  });
});

describe("security filters", () => {
  it("accepts only approved event types", () => {
    expect(parseSecurityFilters({ event: "authz.denied" }).event).toBe("authz.denied");
    expect(parseSecurityFilters({ event: "staff.disabled" }).event).toBeNull();
    expect(securityQuery(parseSecurityFilters({ event: "auth.sign_in_failed", page: "3" }), { page: 1 })).toBe("?event=auth.sign_in_failed");
  });
});
