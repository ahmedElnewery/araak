// T170 / FR-031, CL-032, edge case "Audit viewer loses permission": the export, list, count and detail paths obey the
// viewer's categories and filters, and a permission revoked after the list was loaded denies the export (the real route
// handler re-checks at request time). next/headers and next/navigation are in-memory fakes, as in guards.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

const jar = new Map<string, string>();
let currentTenant: { id: string; subdomain: string; displayName: string; state: "active"; logoVersion: number; hasLogo: boolean } | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
  headers: async () => new Headers(),
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
let roleId = "";
const ids: Record<string, number> = {};

beforeAll(async () => {
  fx = await createTwoTenantFixture();
  const [role] = await sql<{ id: string }>(`insert into public.roles (tenant_id, name) values ('${fx.tenantA.id}', 'Auditors') returning id`);
  roleId = role!.id;
  await sql(`insert into public.permission_grants (tenant_id, role_id, permission_key, audit_categories)
               values ('${fx.tenantA.id}', '${roleId}', 'audit_logs.view', '{staff,roles}');
             insert into public.staff_roles (tenant_id, staff_id, role_id) values ('${fx.tenantA.id}', '${fx.staffA.id}', '${roleId}')`);
  const write = async (k: string, tenant: string, category: string, event: string, resourceId: string, actor = fx.managerA.id) => {
    const [r] = await sql<{ id: string }>(`select private.write_tenant_audit('${tenant}', 'staff', ${tenant === fx.tenantA.id ? `'${actor}'` : "null"}, null,
      '${category}', '${event}', 'tenant_staff', '${resourceId}', '{"note":"seeded"}') id`);
    ids[k] = Number(r!.id);
  };
  await write("staff", fx.tenantA.id, "staff", "staff.disabled", fx.staffA.id);
  await write("formula", fx.tenantA.id, "staff", "staff.enabled", "=HYPERLINK(\"http://x\")", fx.staffA.id);
  await write("roles", fx.tenantA.id, "roles", "role.created", "r1");
  await write("settings", fx.tenantA.id, "tenant_settings", "tenant.name_updated", "t1");
  await write("sessions", fx.tenantA.id, "sessions", "session.revoked", "s1");
  await write("other", fx.tenantB.id, "staff", "staff.disabled", "b1");
});
afterAll(async () => {
  await fx?.teardown();
});
beforeEach(() => {
  jar.clear();
  currentTenant = { id: fx.tenantA.id, subdomain: fx.tenantA.subdomain, displayName: "x", state: "active", logoVersion: 0, hasLogo: false };
});

/** Signs in through the cookie-bound server client, like the portal does. */
async function signInAs(staff: TwoTenantFixture["staffA"]) {
  const { createSupabaseServerClient } = await import("../../packages/auth/src/server/supabase");
  const supabase = await createSupabaseServerClient("portal");
  const { error } = await supabase.auth.signInWithPassword({ email: staff.email, password: PASSWORD });
  expect(error).toBeNull();
  const { registerSession } = await import("../../packages/auth/src/server/session-registry");
  await registerSession({ supabase, owner: { kind: "staff", authUserId: staff.userId, tenantId: staff.tenantId, staffId: staff.id } });
  return supabase;
}

const exportRoute = async (query: string) => {
  const { GET } = await import("../../apps/portal/src/app/(tenant)/(app)/audit/export/route");
  return GET(new Request(`http://${fx.tenantA.subdomain}.portal.localhost/audit/export${query}`));
};
const failureOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "none";
  } catch (e) {
    return (e as Error).message;
  }
};
const csvLines = (body: string) => body.replace(/^\uFEFF/, "").trim().split("\r\n");

describe("category-limited reads (delegate with staff + roles)", () => {
  it("list rows, totals and paging never include another category or tenant", async () => {
    const client = await signInAs(fx.staffA);
    const all = await client.rpc("list_tenant_audit", {});
    expect(all.error).toBeNull();
    const data = all.data as { rows: { id: number; category: string }[]; totalCount: number; categories: string[] };
    expect(data.categories).toEqual(["roles", "staff"]);
    expect(new Set(data.rows.map((r) => r.category))).toEqual(new Set(["staff", "roles"]));
    expect(data.totalCount).toBe(3);
    const ungranted = await client.rpc("list_tenant_audit", { p_categories: ["tenant_settings", "sessions"] });
    expect(ungranted.data).toMatchObject({ rows: [], totalCount: 0 });
    const page2 = await client.rpc("list_tenant_audit", { p_limit: 2, p_offset: 2 });
    expect((page2.data as typeof data).rows).toHaveLength(1);
    expect((page2.data as typeof data).totalCount).toBe(3);
    for (const k of ["settings", "sessions", "other"]) {
      const d = await client.rpc("get_tenant_audit_event", { p_id: ids[k]! });
      expect(d.error?.message, k).toBe("event_not_found");
    }
  });

  it("the export route streams CSV with safe columns limited to the granted categories and filters", async () => {
    await signInAs(fx.staffA);
    const res = await exportRoute("");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const lines = csvLines(await res.text());
    expect(lines).toHaveLength(1 + 3); // header + staff, formula, roles
    expect(lines.join("\n")).not.toMatch(/tenant\.name_updated|session\.revoked|b1/);
    expect(lines.join("\n")).not.toMatch(/@|password|token/i); // no emails or secrets
    // spreadsheet formula injection is neutralised
    expect(lines.some((l) => l.includes(`"'=HYPERLINK(""http://x"")"`))).toBe(true);

    const filtered = csvLines(await (await exportRoute("?category=roles")).text());
    expect(filtered).toHaveLength(2);
    expect(filtered[1]).toContain("role.created");
    const forbiddenCat = csvLines(await (await exportRoute("?category=tenant_settings")).text());
    expect(forbiddenCat).toHaveLength(1); // header only
    const byActor = csvLines(await (await exportRoute(`?actor=${fx.staffA.id}`)).text());
    expect(byActor).toHaveLength(2);
    const searched = csvLines(await (await exportRoute("?q=disabled")).text());
    expect(searched).toHaveLength(2);
    const future = csvLines(await (await exportRoute("?from=2999-01-01")).text());
    expect(future).toHaveLength(1);
    const [n] = await sql<{ n: number }>(`select count(*)::int n from public.tenant_audit_events
      where tenant_id = '${fx.tenantA.id}' and event = 'audit.exported' and actor_staff_id = '${fx.staffA.id}'`);
    expect(n!.n).toBe(6); // every export is itself audited
  });

  it("malformed filters are ignored rather than echoed or passed through", async () => {
    await signInAs(fx.staffA);
    const res = await exportRoute("?category=bogus&from=yesterday&actor=not-a-uuid");
    expect(res.status).toBe(200);
    expect(csvLines(await res.text())).toHaveLength(4); // same as no filter
  });
});

describe("stale authorization", () => {
  it("a permission revoked after the list was loaded denies the export, list and detail", async () => {
    const client = await signInAs(fx.staffA);
    expect((await client.rpc("list_tenant_audit", {})).error).toBeNull(); // the page loaded fine
    await sql(`delete from public.staff_roles where staff_id = '${fx.staffA.id}' and role_id = '${roleId}'`);

    expect(await failureOf(exportRoute(""))).toBe("REDIRECT:/forbidden");
    const [denied] = await sql<{ n: number }>(`select count(*)::int n from public.tenant_security_events
      where tenant_id = '${fx.tenantA.id}' and event = 'authz.denied' and metadata ->> 'reason' = 'permission:audit_logs.view'`);
    expect(denied!.n).toBe(1);

    // a client that skips the app and calls the database directly is refused too
    expect((await client.rpc("export_tenant_audit", {})).error?.code).toBe("42501");
    expect((await client.rpc("list_tenant_audit", {})).error?.code).toBe("42501");
    expect((await client.rpc("get_tenant_audit_event", { p_id: ids.staff! })).error?.code).toBe("42501");
  });

  it("ordinary staff and other tenants' managers get nothing", async () => {
    currentTenant = { ...currentTenant!, id: fx.tenantB.id, subdomain: fx.tenantB.subdomain };
    const b = await signInAs(fx.managerB);
    const rows = ((await b.rpc("list_tenant_audit", {})).data as { rows: { id: number }[] }).rows.map((r) => r.id);
    for (const k of ["staff", "roles", "settings", "sessions"]) expect(rows).not.toContain(ids[k]);
    expect((await b.rpc("get_tenant_audit_event", { p_id: ids.staff! })).error?.message).toBe("event_not_found");
    const plain = await signInAs(fx.staffB);
    expect((await plain.rpc("export_tenant_audit", {})).error?.code).toBe("42501");
  });
});

describe("Security Log export", () => {
  it("is manager-only at the route, never through audit_logs.view", async () => {
    await sql(`insert into public.staff_roles (tenant_id, staff_id, role_id) values ('${fx.tenantA.id}', '${fx.staffA.id}', '${roleId}')`);
    const { GET } = await import("../../apps/portal/src/app/(tenant)/(app)/security-logs/export/route");
    const url = `http://${fx.tenantA.subdomain}.portal.localhost/security-logs/export`;
    await signInAs(fx.staffA);
    expect(await failureOf(GET(new Request(url)))).toBe("REDIRECT:/forbidden");
    await signInAs(fx.managerA);
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    const lines = csvLines(await res.text());
    expect(lines[1]).toContain("authz.denied"); // the denial recorded above
  });
});
