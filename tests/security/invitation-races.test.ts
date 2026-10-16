// T100 / SC-003: staff invitation races against the real database (Development project, two disjoint tenants).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateToken, hashToken } from "../../packages/auth/src/tokens";
import { adminClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, PASSWORD, type TwoTenantFixture } from "../helpers/fixtures";

let fx: TwoTenantFixture;
let managerA: Awaited<ReturnType<TwoTenantFixture["managerA"]["signIn"]>>;
let managerB: Awaited<ReturnType<TwoTenantFixture["managerB"]["signIn"]>>;
const tag = randomUUID().slice(0, 8);
let seq = 0;
const email = () => `race-${tag}-${String(++seq)}@example.test`;

beforeAll(async () => {
  fx = await createTwoTenantFixture();
  managerA = await fx.managerA.signIn();
  managerB = await fx.managerB.signIn();
});
afterAll(async () => {
  await fx?.teardown();
});

async function invite(client: typeof managerA.client, to: string) {
  const token = generateToken();
  const { data, error } = await client.rpc("invite_staff", { p_email: to, p_role_ids: [], p_token_hash: hashToken(token) });
  return { id: data as string | null, token, error };
}
const resend = (client: typeof managerA.client, id: string) => {
  const token = generateToken();
  return client.rpc("resend_staff_invitation", { p_invitation_id: id, p_token_hash: hashToken(token) }).then((r) => ({ ...r, token }));
};
const age = (id: string, seconds: number) =>
  sql(`update public.staff_invitation_links set issued_at = issued_at - interval '${String(seconds)} seconds',
         expires_at = expires_at - interval '${String(seconds)} seconds' where invitation_id = '${id}'`);
async function authUser(to: string) {
  const { data, error } = await adminClient().auth.admin.createUser({ email: to, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  fx.trackUser(data.user.id);
  return data.user.id;
}
const redeem = (token: string, userId: string, username: string) =>
  adminClient().rpc("svc_redeem_staff_invitation", {
    p_token_hash: hashToken(token), p_auth_user_id: userId, p_username: username, p_first_name: "Race", p_last_name: "Runner",
  });

describe("resend cooldown and cap under concurrency", () => {
  it("10 parallel resends after the cooldown produce exactly one new link", async () => {
    const inv = await invite(managerA.client, email());
    expect(inv.error).toBeNull();
    await age(inv.id!, 901);
    const results = await Promise.all(Array.from({ length: 10 }, () => resend(managerA.client, inv.id!)));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    for (const r of results.filter((r) => r.error)) expect(r.error!.message).toBe("resend_cooldown");
    const links = await sql(`select 1 from public.staff_invitation_links where invitation_id = '${inv.id!}' and kind = 'resend'`);
    expect(links).toHaveLength(1);
  });

  it("parallel resends never exceed 5 successful resends in 24 hours", async () => {
    const inv = await invite(managerA.client, email());
    for (let i = 0; i < 4; i++) {
      await age(inv.id!, 901);
      expect((await resend(managerA.client, inv.id!)).error).toBeNull();
    }
    await age(inv.id!, 901);
    const results = await Promise.all(Array.from({ length: 10 }, () => resend(managerA.client, inv.id!)));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    const links = await sql<{ n: string }>(`select count(*) n from public.staff_invitation_links where invitation_id = '${inv.id!}' and kind = 'resend'`);
    expect(Number(links[0]!.n)).toBe(5);
    await age(inv.id!, 901);
    expect((await resend(managerA.client, inv.id!)).error!.message).toBe("resend_cap_reached");
  });
});

describe("redemption races", () => {
  it("concurrent redemption of one link creates exactly one tenant_staff", async () => {
    const to = email();
    const inv = await invite(managerA.client, to);
    const userId = await authUser(to);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => redeem(inv.token, userId, `Racer${"abcdefgh"[i]!}`)));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    for (const r of results.filter((r) => r.error)) expect(r.error!.message).toBe("invitation_invalid");
    const rows = await sql(`select 1 from public.tenant_staff where auth_user_id = '${userId}'`);
    expect(rows).toHaveLength(1);
  });

  it("an old link never redeems after a reissue, even when they race", async () => {
    for (let round = 0; round < 6; round++) {
      const to = email();
      const inv = await invite(managerA.client, to);
      const userId = await authUser(to);
      await age(inv.id!, 901);
      const [red, res] = await Promise.all([redeem(inv.token, userId, `Old${"abcdef"[round]!}`), resend(managerA.client, inv.id!)]);
      const redeemed = !red.error;
      const resent = !res.error;
      expect(redeemed && resent).toBe(false); // the reissue and the old redemption can never both win
      if (resent) {
        expect((await redeem(inv.token, userId, `Late${"abcdef"[round]!}`)).error!.message).toBe("invitation_invalid");
        expect(await sql(`select 1 from public.tenant_staff where auth_user_id = '${userId}'`)).toHaveLength(0);
        expect((await redeem(res.token, userId, `New${"abcdef"[round]!}`)).error).toBeNull(); // the fresh link works
      } else {
        expect(res.error!.message).toBe("invitation_not_pending");
      }
    }
  });

  it("concurrent activations choosing Ahmed and ahmed in one tenant succeed once", async () => {
    const [e1, e2] = [email(), email()];
    const [i1, i2] = [await invite(managerA.client, e1), await invite(managerA.client, e2)];
    const [u1, u2] = [await authUser(e1), await authUser(e2)];
    const [r1, r2] = await Promise.all([redeem(i1.token, u1, "Ahmed"), redeem(i2.token, u2, "ahmed")]);
    expect([r1, r2].filter((r) => !r.error)).toHaveLength(1);
    expect([r1, r2].find((r) => r.error)!.error!.message).toBe("username_taken");
    const loser = r1.error ? i1 : i2;
    // the failed activation consumed nothing: the invitation is still pending and its link still valid
    const still = await sql<{ state: string }>(`select state from public.staff_invitations where id = '${loser.id!}'`);
    expect(still[0]!.state).toBe("pending");
  });
});

describe("global email reservation through the RPC", () => {
  it("two tenants inviting the same address at the same moment yield exactly one invitation", async () => {
    const to = email();
    const results = await Promise.all([
      invite(managerA.client, to), invite(managerB.client, to.toUpperCase()), invite(managerA.client, ` ${to} `), invite(managerB.client, to),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    for (const r of results.filter((r) => r.error)) {
      expect(r.error!.message).toBe("email_unavailable"); // neutral
      expect(r.error!.message).not.toContain(fx.tenantA.subdomain);
      expect(r.error!.message).not.toContain(fx.tenantB.subdomain);
    }
    const pending = await sql(`select 1 from public.staff_invitations where recipient_email_normalized = '${to}' and state = 'pending'`);
    expect(pending).toHaveLength(1);
  });
});
