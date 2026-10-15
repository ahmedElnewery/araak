import { describe, expect, it } from "vitest";
import { isTenantGrantable } from "./catalog";
import type { EffectivePermissions } from "./evaluate";
import { applySwitchEdit, grantsToSwitches, offerableSwitches, switchesToGrants } from "./role-switches";

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
  it("an edit keeps the stored grants of switches the actor cannot offer, exactly as stored", () => {
    const audit = { key: "audit_logs.view", scope: "all", auditCategories: ["staff", "roles"] };
    const stored = [{ key: "staff.view", scope: "all", auditCategories: null }, audit];
    // a delegate who can only offer viewStaff renames the role without touching anything
    const same = applySwitchEdit(stored, ["viewStaff"], ["viewStaff"]);
    expect(same).toEqual([{ key: "staff.view", scope: "all" }, audit]);
    // switching viewStaff off removes only that grant; the locked audit grant survives
    expect(applySwitchEdit(stored, [], ["viewStaff"])).toEqual([audit]);
    // a forged submission of a locked switch is ignored
    expect(applySwitchEdit([], ["viewAudit", "viewStaff"], ["viewStaff"])).toEqual([{ key: "staff.view", scope: "all" }]);
  });
  it("an actor who can offer every switch fully controls the grants", () => {
    const all = ["viewStaff", "manageStaff", "manageRoles", "viewAudit"] as const;
    const stored = [{ key: "audit_logs.view", scope: "all", auditCategories: ["staff"] }];
    expect(applySwitchEdit(stored, ["viewAudit"], all)).toEqual(switchesToGrants(["viewAudit"]));
    expect(applySwitchEdit(stored, [], all)).toEqual([]);
  });
});
