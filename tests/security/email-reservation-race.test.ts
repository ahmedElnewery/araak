// T060 / SC-003 / CL-048: 20 parallel issuances for one email across two tenants -> exactly one pending invitation.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

const issue = (tenantId: string, email: string) =>
  sql(`select private.issue_staff_invitation('${tenantId}', '${email}', '{}', false, null, '${fx.platformAdminId}',
        '${createHash("sha256").update(randomUUID()).digest("hex")}')`);

describe("global email reservation under concurrency", () => {
  it("20 parallel issuances (two tenants, case variants) produce exactly one invitation", async () => {
    const tag = randomUUID().slice(0, 8);
    const variants = [`Race-${tag}@Example.test`, ` race-${tag}@example.test `, `RACE-${tag}@example.TEST`];
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => issue(i % 2 ? fx.tenantA.id : fx.tenantB.id, variants[i % 3]!)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      // neutral: the error never names the winning tenant
      const msg = String((r as PromiseRejectedResult).reason);
      expect(msg).toContain("email_unavailable");
      expect(msg).not.toContain(fx.tenantA.subdomain);
      expect(msg).not.toContain(fx.tenantB.subdomain);
    }
    const pending = await sql(`select 1 from public.staff_invitations where recipient_email_normalized = 'race-${tag}@example.test' and state = 'pending'`);
    expect(pending).toHaveLength(1);
    const reservations = await sql(`select 1 from public.email_reservations where email_normalized = 'race-${tag}@example.test'`);
    expect(reservations).toHaveLength(1);
  });
});
