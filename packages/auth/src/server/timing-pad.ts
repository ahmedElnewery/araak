import "server-only";
import { randomInt } from "node:crypto";

/**
 * research.md R-02 item 5: a wrong password for a known user took p50 219 ms. Used until enough real failures have
 * been measured in this process.
 */
const DEFAULT_PASSWORD_CHECK_MS = 220;
const MAX_SAMPLES = 50;
const MIN_SAMPLES = 5;
const JITTER_MS = 20;
const samples: number[] = [];

/** Records how long a REAL failed password check took, so the padded path keeps costing the same. */
export function recordPasswordCheckDuration(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0 || ms > 10_000) return;
  samples.push(ms);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function typicalPasswordCheckMs(): number {
  if (samples.length < MIN_SAMPLES) return DEFAULT_PASSWORD_CHECK_MS;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? DEFAULT_PASSWORD_CHECK_MS;
}

/**
 * Sign-in for an unknown, throttled or foreign identifier waits as long as a real failed password check, so every
 * failure path costs the same (research.md R-02 item 5). It deliberately makes NO Supabase Auth call: every Auth call
 * from the server spends the per-IP sign-in budget all tenants share (R-02 item 6), and a throttled or unknown attempt
 * must not let an attacker exhaust it for everyone.
 */
export async function padFailedSignIn(): Promise<void> {
  const ms = Math.max(0, typicalPasswordCheckMs() + randomInt(-JITTER_MS, JITTER_MS + 1));
  await new Promise((resolve) => setTimeout(resolve, ms));
}
