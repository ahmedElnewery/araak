import { describe, expect, it } from "vitest";
import type { EffectiveGrant, EffectivePermissions } from "@workspace/authorization";
import { getDictionary } from "@workspace/i18n";
import { buildAccountSection, buildNavigation } from "./navigation";

const t = getDictionary("en").portal.nav;
const grants = (...keys: EffectiveGrant["key"][]): EffectivePermissions => ({
  isManager: false,
  permissions: keys.map((key) => ({ key, scope: "all", auditCategories: null })),
});
const ids = (perms: EffectivePermissions) =>
  buildNavigation(perms, t).map((g) => ({ group: g.id, items: g.items.map((i) => (i.children.length ? `${i.id}(${i.children.map((c) => c.id).join(",")})` : i.id)) }));

describe("portal navigation", () => {
  it("a manager sees the main and system groups, with business modules hidden until they are built", () => {
    expect(ids({ isManager: true, permissions: [] })).toEqual([
      { group: "main", items: ["home"] },
      { group: "system", items: ["settings(staff,roles,branding)", "audit", "security"] },
    ]);
  });
  it("labels the groups", () => {
    expect(buildNavigation({ isManager: true, permissions: [] }, t).map((g) => g.label)).toEqual([t.mainGroup, t.systemGroup]);
  });
  it("offers Invite staff in Settings only to someone who may invite but cannot open the staff directory", () => {
    expect(ids(grants("staff.invite"))[1]?.items).toEqual(["settings(invite)"]);
    expect(ids(grants("staff.invite", "staff.view"))[1]?.items).toEqual(["settings(staff)"]);
  });
  it("hides Settings when nothing inside it is available", () => {
    expect(ids(grants())).toEqual([{ group: "main", items: ["home"] }]);
  });
  it("the account section holds the person's own pages, never the primary navigation", () => {
    expect(buildAccountSection(grants(), t).map((i) => i.href)).toEqual(["/account", "/account/appearance", "/account/password", "/account/sessions"]);
    expect(JSON.stringify(buildNavigation({ isManager: true, permissions: [] }, t))).not.toContain("/account");
  });
});
