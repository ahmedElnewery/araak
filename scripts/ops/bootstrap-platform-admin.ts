// One-time bootstrap of the first platform admin (CL-043). Operations only: never run from application code.
//   OPS_CONFIRM=yes OPERATOR_REF=<ref> TARGET_EMAIL=<email> NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
//     node scripts/ops/bootstrap-platform-admin.ts
// The target administrator types their own password at a hidden prompt. No invitation link or setup screen is used.
import { fail, passwordPolicyOk, promptHidden, requireOps, serviceClient } from "./_shared.ts";

const env = requireOps();
const email = (process.env.TARGET_EMAIL ?? process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+$/.test(email)) fail("TARGET_EMAIL (or the first argument) must be an email address.");
const admin = serviceClient(env);

// 1. Refuse early if bootstrap already happened (the database function remains the authority).
const { count, error: countError } = await admin.from("platform_admins").select("auth_user_id", { count: "exact", head: true });
if (countError) fail("could not read platform state.");
if ((count ?? 0) > 0) fail("a platform admin already exists; bootstrap is one-time.");

// 2. The target administrator chooses the password (hidden prompt, checked against the policy).
const password = await promptHidden("Password for the first platform admin (input hidden): ");
if (!passwordPolicyOk(password)) fail("the password does not meet the policy (8+ characters with lowercase, uppercase and digits).");

// 3. The operator has verified the target's identity and mailbox out of band.
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createError || !created.user) fail("could not create the Auth user.");
const userId = created.user.id;

// 4. Promote atomically; if the database refuses (lost race / already bootstrapped), remove the Auth user again.
const { data: ok, error: rpcError } = await admin.rpc("svc_ops_bootstrap_platform_admin", {
  p_auth_user_id: userId,
  p_operator_ref: env.OPERATOR_REF as string,
});
if (rpcError || ok !== true) {
  await admin.auth.admin.deleteUser(userId);
  fail("bootstrap refused (already bootstrapped or lost a race); the created Auth user was removed.");
}
console.log(`Bootstrapped the first platform admin (user ${userId}). Sign in through the normal admin login.`);
