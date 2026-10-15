// Operations-only removal of a platform admin (CL-041). There is no application route for this.
//   OPS_CONFIRM=yes OPERATOR_REF=<ref> TICKET_REF=<ticket> TARGET_EMAIL=<email> [EMERGENCY=yes] \
//     NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/ops/revoke-platform-admin.ts
import { fail, requireOps, serviceClient } from "./_shared.ts";

const env = requireOps(["TICKET_REF"]);
const email = (process.env.TARGET_EMAIL ?? process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+$/.test(email)) fail("TARGET_EMAIL (or the first argument) must be an email address.");
const emergency = process.env.EMERGENCY === "yes";
const admin = serviceClient(env);

// Every page: tenant staff are Auth users too, so the target can sit far beyond the first page.
const PER_PAGE = 1000;
let user: { id: string } | undefined;
for (let page = 1; !user; page++) {
  const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
  if (listError) fail("could not look up the user.");
  user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (data.users.length < PER_PAGE) break;
}
if (!user) fail("no such platform admin.");

const { data: ok, error } = await admin.rpc("svc_ops_revoke_platform_admin", {
  p_auth_user_id: user.id,
  p_operator_ref: env.OPERATOR_REF as string,
  p_ticket_ref: env.TICKET_REF as string,
  p_emergency: emergency,
});
if (error) fail(error.message === "last_platform_admin" ? "this is the last enabled admin with tenants.manage; use EMERGENCY=yes only on the emergency path." : "the database refused the revocation.");
if (ok !== true) fail("the target is not an enabled platform admin.");
console.log(`Revoked platform admin ${user.id}: disabled, all sessions ended, audited (ticket ${env.TICKET_REF}).`);
