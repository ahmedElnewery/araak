import { describe, expect, it } from "vitest";
import { MANAGER_ONLY_KEYS, TENANT_GRANTABLE_KEYS, PLATFORM_CAPABILITIES, isTenantGrantable } from "./catalog";

describe("catalog", () => {
  it("has the 11 tenant-grantable keys and 4 manager-only authorities, disjoint", () => {
    expect(TENANT_GRANTABLE_KEYS).toHaveLength(11);
    expect(MANAGER_ONLY_KEYS).toHaveLength(4);
    expect(TENANT_GRANTABLE_KEYS.filter((k) => (MANAGER_ONLY_KEYS as readonly string[]).includes(k))).toEqual([]);
  });
  it("does not treat manager-only keys as grantable", () => {
    for (const k of MANAGER_ONLY_KEYS) expect(isTenantGrantable(k)).toBe(false);
    for (const k of TENANT_GRANTABLE_KEYS) expect(isTenantGrantable(k)).toBe(true);
  });
  it("lists the five platform capabilities", () => {
    expect(PLATFORM_CAPABILITIES).toHaveLength(5);
  });
});
