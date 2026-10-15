import { describe, expect, it } from "vitest";
import type { EffectivePermissions } from "./evaluate";
import { scopeAllows } from "./scope";

const me = { tenantId: "t1", staffId: "s1" };
const holder = (scope: "all" | "own" | "assigned"): EffectivePermissions => ({
  isManager: false, permissions: [{ key: "staff.view", scope, auditCategories: null }],
});

describe("scopeAllows", () => {
  it("all reaches every record of the tenant", () => {
    expect(scopeAllows(holder("all"), me, "staff.view", { tenantId: "t1", ownerStaffId: "other" })).toBe(true);
  });
  it("own reaches only owned records and does not imply all", () => {
    expect(scopeAllows(holder("own"), me, "staff.view", { tenantId: "t1", ownerStaffId: "s1" })).toBe(true);
    expect(scopeAllows(holder("own"), me, "staff.view", { tenantId: "t1", ownerStaffId: "other" })).toBe(false);
  });
  it("assigned reaches only assigned records and does not imply all", () => {
    expect(scopeAllows(holder("assigned"), me, "staff.view", { tenantId: "t1", assigneeStaffIds: ["x", "s1"] })).toBe(true);
    expect(scopeAllows(holder("assigned"), me, "staff.view", { tenantId: "t1", assigneeStaffIds: ["x"] })).toBe(false);
    expect(scopeAllows(holder("assigned"), me, "staff.view", { tenantId: "t1", ownerStaffId: "s1" })).toBe(false);
  });
  it("never crosses tenants, even for all-scope and managers", () => {
    expect(scopeAllows(holder("all"), me, "staff.view", { tenantId: "t2" })).toBe(false);
    expect(scopeAllows({ isManager: true, permissions: [] }, me, "staff.view", { tenantId: "t2" })).toBe(false);
  });
  it("a manager holds every grantable key with scope all, but not manager-only keys as record scopes", () => {
    expect(scopeAllows({ isManager: true, permissions: [] }, me, "staff.view", { tenantId: "t1" })).toBe(true);
    expect(scopeAllows({ isManager: true, permissions: [] }, me, "security_logs.view", { tenantId: "t1" })).toBe(false);
  });
  it("a key that is not held grants nothing", () => {
    expect(scopeAllows(holder("all"), me, "roles.view", { tenantId: "t1" })).toBe(false);
  });
});
