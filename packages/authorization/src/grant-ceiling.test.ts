import { describe, expect, it } from "vitest";
import type { EffectivePermissions } from "./evaluate";
import { canGrant } from "./grant-ceiling";

const mgr: EffectivePermissions = { isManager: true, permissions: [] };
const holder = (...p: EffectivePermissions["permissions"]): EffectivePermissions => ({ isManager: false, permissions: p });
const g = (key: string, scope: "all" | "own" | "assigned" = "all", auditCategories: never = undefined as never) => ({ key, scope, auditCategories });

describe("canGrant", () => {
  it("lets a manager confer any tenant-grantable key", () => {
    expect(canGrant(mgr, [g("staff.view"), g("roles.create")])).toEqual({ ok: true });
  });
  it("never lets anyone, manager included, confer manager-only authorities", () => {
    for (const key of ["tenant.branding.edit", "security_logs.view", "staff.invitation.resend", "staff.password.reset", "made.up"]) {
      expect(canGrant(mgr, [g(key)])).toEqual({ ok: false, key, reason: "not_grantable" });
      expect(canGrant(holder({ key: "roles.update", scope: "all", auditCategories: null }), [g(key)])).toMatchObject({ ok: false });
    }
  });
  it("requires the actor to hold the key", () => {
    const a = holder({ key: "roles.update", scope: "all", auditCategories: null });
    expect(canGrant(a, [g("roles.update")])).toEqual({ ok: true });
    expect(canGrant(a, [g("staff.disable")])).toEqual({ ok: false, key: "staff.disable", reason: "above_authority" });
  });
  it("rejects unsupported scopes in the catalog even for managers", () => {
    expect(canGrant(mgr, [g("staff.view", "own")])).toEqual({ ok: false, key: "staff.view", reason: "scope_unsupported" });
  });
  it("requires audit categories for audit_logs.view and forbids them elsewhere", () => {
    expect(canGrant(mgr, [{ key: "audit_logs.view", scope: "all", auditCategories: null }])).toMatchObject({ ok: false, reason: "audit_categories" });
    expect(canGrant(mgr, [{ key: "audit_logs.view", scope: "all", auditCategories: [] }])).toMatchObject({ ok: false, reason: "audit_categories" });
    expect(canGrant(mgr, [{ key: "staff.view", scope: "all", auditCategories: ["staff"] }])).toMatchObject({ ok: false, reason: "audit_categories" });
    expect(canGrant(mgr, [{ key: "audit_logs.view", scope: "all", auditCategories: ["staff", "roles"] }])).toEqual({ ok: true });
  });
  it("limits delegated audit grants to categories the actor holds", () => {
    const a = holder({ key: "audit_logs.view", scope: "all", auditCategories: ["staff", "roles"] });
    expect(canGrant(a, [{ key: "audit_logs.view", scope: "all", auditCategories: ["staff"] }])).toEqual({ ok: true });
    expect(canGrant(a, [{ key: "audit_logs.view", scope: "all", auditCategories: ["staff", "sessions"] }])).toMatchObject({ ok: false, reason: "audit_categories" });
  });
  it("is all-or-nothing across a role's grants", () => {
    const a = holder({ key: "roles.update", scope: "all", auditCategories: null });
    expect(canGrant(a, [g("roles.update"), g("staff.disable")])).toMatchObject({ ok: false, key: "staff.disable" });
  });
});
