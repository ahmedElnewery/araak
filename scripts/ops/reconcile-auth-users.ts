// Reconciles half-created accounts (research.md R-01): Auth users older than 1 hour that have neither a tenant_staff
// nor a platform_admins row. They can never sign in to anything, but they hold an email address.
//   OPS_CONFIRM=yes OPERATOR_REF=<ref> NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
//     node scripts/ops/reconcile-auth-users.ts [--apply]
// Without --apply it only reports. With --apply it deletes the orphans it reported. Never grants access.
import { fail, requireOps, serviceClient } from "./_shared.ts";

const env = requireOps();
const apply = process.argv.includes("--apply");
const admin = serviceClient(env);
const cutoff = Date.now() - 60 * 60 * 1000;
// identity earlier versions of the sign-in timing pad created (the pad no longer calls Supabase Auth); never an account
const IGNORED = new Set(["signin-timing-pad@example.com"]);

const orphans: { id: string; email: string; createdAt: string }[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
  if (error) fail("could not list Auth users.");
  if (data.users.length === 0) break;
  const old = data.users.filter((u) => new Date(u.created_at).getTime() < cutoff && !IGNORED.has((u.email ?? "").toLowerCase()));
  if (old.length > 0) {
    const ids = old.map((u) => u.id);
    const [{ data: staff, error: e1 }, { data: admins, error: e2 }] = await Promise.all([
      admin.from("tenant_staff").select("auth_user_id").in("auth_user_id", ids),
      admin.from("platform_admins").select("auth_user_id").in("auth_user_id", ids),
    ]);
    if (e1 || e2) fail("could not read account links.");
    const linked = new Set([...staff.map((r) => r.auth_user_id), ...admins.map((r) => r.auth_user_id)]);
    for (const u of old) if (!linked.has(u.id)) orphans.push({ id: u.id, email: u.email ?? "", createdAt: u.created_at });
  }
  if (data.users.length < 500) break;
}

console.log(`${orphans.length} orphaned Auth user(s) older than 1 hour.`);
for (const o of orphans) console.log(`- ${o.id}  ${o.email}  created ${o.createdAt}`);
if (!apply) {
  if (orphans.length > 0) console.log("Report only. Re-run with --apply to delete them.");
  process.exit(0);
}
let deleted = 0;
for (const o of orphans) {
  const { error } = await admin.auth.admin.deleteUser(o.id);
  if (error) console.error(`could not delete ${o.id}`);
  else deleted++;
}
console.log(`Deleted ${deleted} of ${orphans.length} (operator ${env.OPERATOR_REF}).`);
