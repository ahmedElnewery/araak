import { loadTestEnv } from "./env";

/**
 * Runs SQL on the Development project through the Supabase Management API (the same
 * channel the Supabase MCP uses). No database URL, Docker or CLI. Locked to the Dev ref.
 * Statements run as the `postgres` role in a single request; use it for fixtures,
 * inspection and role-impersonating assertions (`set local role ...`).
 */
export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const env = loadTestEnv();
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);
  return JSON.parse(text) as T[];
}
