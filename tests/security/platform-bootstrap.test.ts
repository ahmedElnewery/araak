// T077 / CL-043, SC-002: one-time, operations-only bootstrap of the first platform admin.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { adminClient } from "../helpers/clients";
import { sql } from "../helpers/db";

const tag = randomUUID().slice(0, 8);
const emails = Array.from({ length: 6 }, (_, i) => `bootstrap-${i}-${tag}@platform.example.test`);

/** Runs the ops script the way an operator would: password on a hidden prompt (stdin here), never argv/env. */
function runBootstrap(email: string) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    const child = spawn("node", ["scripts/ops/bootstrap-platform-admin.ts"], {
      env: { ...process.env, OPS_CONFIRM: "yes", OPERATOR_REF: `test-${tag}`, TARGET_EMAIL: email },
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.stdin.end("Boot-Strap-Pass-1234\n");
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

async function usersForTag() {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return data.users.filter((u) => u.email?.endsWith(`-${tag}@platform.example.test`));
}

afterAll(async () => {
  const admin = adminClient();
  for (const u of await usersForTag()) {
    await sql(`set local app.retention_purge = 'on'; delete from public.platform_audit_events where actor_platform_admin_id = '${u.id}' or metadata->>'authUserId' = '${u.id}';
               delete from public.platform_admins where auth_user_id = '${u.id}'`).catch(() => undefined);
    await admin.auth.admin.deleteUser(u.id);
  }
  // the one-time marker would otherwise block the real bootstrap on this project
  await sql(`delete from private.platform_bootstrap_state where operator_ref = 'test-${tag}'`).catch(() => undefined);
});

describe("platform bootstrap", () => {
  it("only runs when no platform admin exists yet (skipped on a project that already has one)", async () => {
    const existing = await sql<{ n: number }>(`select count(*)::int n from public.platform_admins`);
    if (existing[0]!.n > 0) {
      const r = await runBootstrap(emails[0]!);
      expect(r.code).not.toBe(0);
      expect(await usersForTag()).toHaveLength(0); // no orphan Auth user
      return;
    }
    const first = await runBootstrap(emails[0]!);
    expect(first.code, first.out).toBe(0);
    expect(first.out).not.toContain("Boot-Strap-Pass-1234");
    const rows = await sql<{ created_via: string; capabilities: string[] }>(`select created_via, capabilities from public.platform_admins`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.created_via).toBe("bootstrap");
    expect(rows[0]!.capabilities.sort()).toEqual(["platform_admins.invite", "platform_audit.view", "tenants.managers.manage", "tenants.manage", "tenants.staff.manage"].sort());
    expect(await sql(`select 1 from public.platform_invitations`)).toHaveLength(0); // no invitation is created
    const audit = await sql<{ metadata: unknown }>(`select metadata from public.platform_audit_events where event = 'platform_admin.bootstrapped'`);
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toMatch(/password|Boot-Strap/i);

    // a second run and 5 concurrent runs refuse and leave no orphan Auth users
    const results = await Promise.all([runBootstrap(emails[1]!), ...emails.slice(2).map(runBootstrap)]);
    for (const r of results) expect(r.code).not.toBe(0);
    expect(await usersForTag()).toHaveLength(1);
    expect(await sql(`select 1 from public.platform_admins`)).toHaveLength(1);
  });

  it("is not reachable through any application route and is service_role only in the database", async () => {
    const [fn] = await sql<{ anon: boolean; auth: boolean; svc: boolean }>(
      `select has_function_privilege('anon','private.bootstrap_platform_admin(uuid,text)','execute') anon,
              has_function_privilege('authenticated','private.bootstrap_platform_admin(uuid,text)','execute') auth,
              has_function_privilege('service_role','private.bootstrap_platform_admin(uuid,text)','execute') svc`);
    expect(fn).toEqual({ anon: false, auth: false, svc: true });
    const exposed = await sql<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and proname ~ 'bootstrap|ops_revoke'
         and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
    expect(exposed).toEqual([]);
    const base = process.env.E2E_ADMIN_URL;
    if (!base) return; // route probing needs the running admin app
    for (const path of ["/", "/login", "/admins/accept", "/api/bootstrap", "/admins/bootstrap", "/admins/new"]) {
      const res = await fetch(new URL(path, base), { method: "POST", redirect: "manual" });
      expect([302, 303, 307, 308, 400, 401, 403, 404, 405]).toContain(res.status);
    }
  });
});
