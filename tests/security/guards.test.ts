// T047 + T071: the cookie-bound Supabase client and the portal guard composition, with a real Supabase session.
// next/headers and next/navigation are replaced by in-memory fakes; everything else is the real code.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD, createTwoTenantFixture, type TwoTenantFixture } from "../helpers/fixtures";
import { sql } from "../helpers/db";

const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
const setCalls: { name: string; options: Record<string, unknown> }[] = [];
let currentTenant: { id: string; subdomain: string; displayName: string; state: "active"; logoVersion: number } | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, c]) => ({ name, value: c.value })),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      jar.set(name, { value, options });
      setCalls.push({ name, options });
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../../packages/tenancy/src/server/index.ts", () => ({ resolveTenantFromHost: async () => currentTenant }));

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});
beforeEach(() => {
  jar.clear();
  setCalls.length = 0;
});

const portalClient = async () => (await import("../../packages/auth/src/server/supabase")).createSupabaseServerClient("portal");

async function signInAs(staff: TwoTenantFixture["staffA"]) {
  const supabase = await portalClient();
  const { error } = await supabase.auth.signInWithPassword({ email: staff.email, password: PASSWORD });
  expect(error).toBeNull();
  const { registerSession } = await import("../../packages/auth/src/server/session-registry");
  await registerSession({ supabase, owner: { kind: "staff", authUserId: staff.userId, tenantId: staff.tenantId, staffId: staff.id } });
}

const tenantOf = (t: TwoTenantFixture["tenantA"]) => ({ id: t.id, subdomain: t.subdomain, displayName: "x", state: "active" as const, logoVersion: 0 });
const redirectOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "none";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("createSupabaseServerClient cookies (T047)", () => {
  it("writes host-only, httpOnly, SameSite=Lax cookies named per app", async () => {
    await signInAs(fx.staffA);
    expect(setCalls.length).toBeGreaterThan(0);
    for (const c of setCalls) {
      expect(c.name.startsWith("portal-auth")).toBe(true);
      expect(c.options.domain).toBeUndefined();
      expect(c.options.httpOnly).toBe(true);
      expect(c.options.sameSite).toBe("lax");
      expect(c.options.path).toBe("/");
    }
  });
});

describe("portal guards (T071)", () => {
  it("requireStaff returns the context for the right tenant", async () => {
    currentTenant = tenantOf(fx.tenantA);
    await signInAs(fx.staffA);
    const { requireStaff } = await import("../../apps/portal/src/lib/guards");
    expect(await requireStaff()).toMatchObject({ staffId: fx.staffA.id, tenantId: fx.tenantA.id });
  });
  it("redirects to /login when not signed in, or when the host tenant differs from the user's tenant", async () => {
    const { requireStaff } = await import("../../apps/portal/src/lib/guards");
    currentTenant = tenantOf(fx.tenantA);
    expect(await redirectOf(requireStaff())).toBe("REDIRECT:/login");
    await signInAs(fx.staffA);
    currentTenant = tenantOf(fx.tenantB);
    expect(await redirectOf(requireStaff())).toBe("REDIRECT:/login");
  });
  it("renders a neutral 404 when the host has no tenant", async () => {
    const { requireStaff } = await import("../../apps/portal/src/lib/guards");
    currentTenant = null;
    expect(await redirectOf(requireStaff())).toBe("NOT_FOUND");
  });
  it("sends suspended tenants to /suspended and disabled staff to /forbidden", async () => {
    const { requireStaff } = await import("../../apps/portal/src/lib/guards");
    currentTenant = tenantOf(fx.tenantA);
    await signInAs(fx.staffA);
    await sql(`update public.tenants set state = 'suspended' where id = '${fx.tenantA.id}'`);
    expect(await redirectOf(requireStaff())).toBe("REDIRECT:/suspended");
    await sql(`update public.tenants set state = 'active' where id = '${fx.tenantA.id}'`);
    await sql(`update public.tenant_staff set enabled = false where id = '${fx.staffA.id}'`);
    expect(await redirectOf(requireStaff())).toBe("REDIRECT:/forbidden");
    await sql(`update public.tenant_staff set enabled = true where id = '${fx.staffA.id}'`);
  });
  it("requirePermission allows a holder, denies others with /forbidden and records a security event", async () => {
    const { requirePermission, requireManager } = await import("../../apps/portal/src/lib/guards");
    currentTenant = tenantOf(fx.tenantA);
    await signInAs(fx.staffA);
    expect(await requirePermission("staff.view")).toMatchObject({ staffId: fx.staffA.id });
    expect(await redirectOf(requirePermission("roles.create"))).toBe("REDIRECT:/forbidden");
    expect(await redirectOf(requireManager())).toBe("REDIRECT:/forbidden");
    const events = await sql<{ metadata: { reason: string } }>(
      `select metadata from public.tenant_security_events where tenant_id = '${fx.tenantA.id}' and event = 'authz.denied' order by id`);
    expect(events.map((e) => e.metadata.reason)).toEqual(["permission:roles.create", "manager_only"]);
  });
  it("a manager passes requireManager and every grantable permission", async () => {
    const { requirePermission, requireManager } = await import("../../apps/portal/src/lib/guards");
    currentTenant = tenantOf(fx.tenantA);
    await signInAs(fx.managerA);
    expect(await requireManager()).toMatchObject({ isManager: true });
    expect(await requirePermission("roles.create")).toMatchObject({ staffId: fx.managerA.id });
  });
});
