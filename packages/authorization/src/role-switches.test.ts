import { describe, expect, it } from "vitest";
import { isTenantGrantable } from "./catalog";
import type { EffectivePermissions } from "./evaluate";
import { grantsToSwitches, offerableSwitches, switchesToGrants } from "./role-switches";

describe("role switches", () => {
  it("only ever maps to tenant-grantable keys", () => {
    const grants = switchesToGrants(["viewStaff", "manageStaff", "manageRoles", "viewAudit"]);
    expect(grants.every((g) => isTenantGrantable(g.key))).toBe(true);
    expect(grants.map((g) => g.key)).toEqual(expect.arrayContaining(["staff.view", "staff.roles.assign", "roles.restore", "audit_logs.view"]));
  });
  it("managing staff implies viewing them", () => {
    expect(switchesToGrants(["manageStaff"]).map((g) => g.key)).toContain("staff.view");
  });
  it("the audit switch grants all five categories", () => {
    const g = switchesToGrants(["viewAudit"]);
    expect(g).toEqual([{ key: "audit_logs.view", scope: "all", auditCategories: ["staff", "invitations", "roles", "tenant_settings", "sessions"] }]);
  });
  it("round-trips every combination", () => {
    const all = ["viewStaff", "manageStaff", "manageRoles", "viewAudit"] as const;
    for (let m = 0; m < 16; m++) {
      const on = all.filter((_, i) => m & (1 << i));
      const back = grantsToSwitches(switchesToGrants(on));
      expect(back.extra).toBe(false);
      const expected = new Set(on);
      if (expected.has("manageStaff")) expected.add("viewStaff");
      expect(new Set(back.on)).toEqual(expected);
    }
  });
  it("flags grants the switches cannot express", () => {
    expect(grantsToSwitches([{ key: "staff.view", scope: "all" }, { key: "staff.invite", scope: "all" }]).extra).toBe(true);
    expect(grantsToSwitches([{ key: "audit_logs.view", scope: "all", auditCategories: ["staff"] }]).extra).toBe(true);
  });
  it("a delegate is offered only the switches they hold completely", () => {
    const held = (...keys: string[]): EffectivePermissions => ({
      isManager: false, permissions: keys.map((key) => ({ key: key as never, scope: "all", auditCategories: null })),
    });
    expect(offerableSwitches({ isManager: true, permissions: [] })).toHaveLength(4);
    expect(offerableSwitches(held("staff.view"))).toEqual(["viewStaff"]);
    expect(offerableSwitches(held("roles.view", "roles.create", "roles.update", "roles.archive", "roles.restore"))).toEqual(["manageRoles"]);
    expect(offerableSwitches(held("roles.view"))).toEqual([]);
  });
});
