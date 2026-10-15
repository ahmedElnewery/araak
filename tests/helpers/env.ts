// Test guard (FR-043): tests run only against the Development Supabase project.
// Production is never reachable: the URL must contain the Development project ref and
// must not contain the Production ref when one is configured.
const DEV_REF = process.env.SUPABASE_DEV_PROJECT_REF;
const PROD_REF = process.env.SUPABASE_PROD_PROJECT_REF;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export function loadTestEnv() {
  if (process.env.SUPABASE_ENV !== "development") throw new Error("SUPABASE_ENV must be 'development'");
  if (!DEV_REF) throw new Error("SUPABASE_DEV_PROJECT_REF is not set");
  if (PROD_REF && PROD_REF === DEV_REF) throw new Error("Dev and Prod project refs are identical");
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).hostname !== `${DEV_REF}.supabase.co`) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not the Development project");
  }
  if (PROD_REF && url.includes(PROD_REF)) throw new Error("URL points at Production");
  return {
    ref: DEV_REF,
    url,
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: required("SUPABASE_SECRET_KEY"),
    accessToken: required("SUPABASE_ACCESS_TOKEN"),
  };
}
