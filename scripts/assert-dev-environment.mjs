// Guard for anything destructive (tests, resets, seeds). Refuses to run unless the
// target is the Development Supabase project and clearly NOT Production.
const env = process.env;
const fail = (m) => {
  console.error(`Refusing to run: ${m}`);
  process.exit(1);
};

if (env.SUPABASE_ENV !== "development") fail("SUPABASE_ENV must be 'development'.");
const dev = env.SUPABASE_DEV_PROJECT_REF;
const prod = env.SUPABASE_PROD_PROJECT_REF;
if (!dev) fail("SUPABASE_DEV_PROJECT_REF is not set.");
if (prod && prod === dev) fail("Development and Production project refs are identical.");

const target = env.SUPABASE_PROJECT_REF ?? dev;
if (target !== dev) fail("SUPABASE_PROJECT_REF does not match SUPABASE_DEV_PROJECT_REF.");
if (prod && [env.NEXT_PUBLIC_SUPABASE_URL].some((v) => v?.includes(prod))) {
  fail("A connection setting points at the Production project.");
}
for (const v of [env.NEXT_PUBLIC_SUPABASE_URL]) {
  if (v && !v.includes(dev)) fail("A connection setting does not reference the Development project ref.");
}
console.log(`Environment OK: development project ${dev}`);
