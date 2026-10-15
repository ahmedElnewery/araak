// T101 / CL-017..CL-019: recovery issuance and redemption under concurrency (Development project).
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

const th = () => createHash("sha256").update(randomUUID()).digest("hex");
const issue = (staffId: string, hash = th()) =>
  adminClient().rpc("svc_issue_recovery", {
    p_staff_id: staffId, p_origin: "self_service", p_actor_staff_id: null as never, p_actor_platform_admin_id: null as never, p_token_hash: hash,
  });
const begin = (hash: string) => adminClient().rpc("svc_begin_recovery_redemption", { p_token_hash: hash });
const reset = (staffId: string) => sql(`delete from public.recovery_requests where staff_id = '${staffId}'`);
/** n past issuances, each `gapMinutes` apart, newest first one `firstAgoMinutes` ago (all outside the 300 s cooldown). */
const seed = async (tenantId: string, staffId: string, n: number, firstAgoMinutes: number) => {
  for (let i = 0; i < n; i++) {
    const ago = firstAgoMinutes + i * 10;
    await sql(`insert into public.recovery_requests (tenant_id, staff_id, origin, token_hash, issued_at, expires_at, superseded_at)
               values ('${tenantId}', '${staffId}', 'self_service', '${th()}', now() - interval '${String(ago)} minutes',
                       now() - interval '${String(ago)} minutes' + interval '60 minutes', now())`);
  }
};

describe("recovery issuance", () => {
  it("parallel issuance inside the cooldown issues exactly one link", async () => {
    await reset(fx.staffA.id);
    const results = await Promise.all(Array.from({ length: 12 }, () => issue(fx.staffA.id)));
    expect(results.filter((r) => r.data === true)).toHaveLength(1);
    expect(await sql(`select 1 from public.recovery_requests where staff_id = '${fx.staffA.id}'`)).toHaveLength(1);
    expect(await sql(`select 1 from public.recovery_requests where staff_id = '${fx.staffA.id}' and superseded_at is null`)).toHaveLength(1);
  });

  it("parallel requests cannot exceed 5 issuances in 24 hours", async () => {
    await reset(fx.staffA.id);
    await seed(fx.tenantA.id, fx.staffA.id, 4, 10); // four earlier issuances, all outside the cooldown
    const results = await Promise.all(Array.from({ length: 12 }, () => issue(fx.staffA.id)));
    expect(results.filter((r) => r.data === true)).toHaveLength(1); // the 5th only
    expect(await sql(`select 1 from public.recovery_requests where staff_id = '${fx.staffA.id}'`)).toHaveLength(5);
    await reset(fx.staffA.id);
    await seed(fx.tenantA.id, fx.staffA.id, 5, 10);
    const none = await Promise.all(Array.from({ length: 6 }, () => issue(fx.staffA.id)));
    expect(none.filter((r) => r.data === true)).toHaveLength(0);
    expect(await sql(`select 1 from public.recovery_requests where staff_id = '${fx.staffA.id}'`)).toHaveLength(5);
  });

  it("counters are independent per account", async () => {
    await reset(fx.staffA.id);
    await reset(fx.staffB.id);
    await seed(fx.tenantA.id, fx.staffA.id, 5, 10);
    expect((await issue(fx.staffA.id)).data).toBe(false);
    expect((await issue(fx.staffB.id)).data).toBe(true);
  });
});

describe("recovery redemption vs reissue", () => {
  it("a redemption racing a reissue never lets the older link succeed afterwards", async () => {
    for (let round = 0; round < 6; round++) {
      await reset(fx.managerA.id);
      const l1 = th();
      const l2 = th();
      expect((await issue(fx.managerA.id, l1)).data).toBe(true);
      await sql(`update public.recovery_requests set issued_at = issued_at - interval '301 seconds', expires_at = expires_at - interval '301 seconds' where staff_id = '${fx.managerA.id}'`);
      const [b, i] = await Promise.all([begin(l1), issue(fx.managerA.id, l2)]);
      // whichever order won, the older link is now spent or superseded and cannot be redeemed again
      expect((await begin(l1)).data).toBeNull();
      const live = await sql(`select 1 from public.recovery_requests where staff_id = '${fx.managerA.id}' and used_at is null and superseded_at is null and failed_at is null`);
      expect(live.length).toBeLessThanOrEqual(1);
      if (b.data && i.data === true) {
        // the redemption was serialized first: the new link then supersedes nothing that is unused
        expect((await begin(l2)).data).not.toBeNull();
      }
    }
  });

  it("a link is single use under parallel redemption", async () => {
    await reset(fx.staffA.id);
    const l = th();
    expect((await issue(fx.staffA.id, l)).data).toBe(true);
    const results = await Promise.all(Array.from({ length: 10 }, () => begin(l)));
    expect(results.filter((r) => r.data)).toHaveLength(1);
  });
});
