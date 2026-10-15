// Shared helpers for operations-only scripts. Never imported by application code.
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

export function requireOps(extra: string[] = []): Record<string, string> {
  if (process.env.OPS_CONFIRM !== "yes") fail("Set OPS_CONFIRM=yes to confirm this is a deliberate operations action.");
  const names = ["OPERATOR_REF", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", ...extra];
  const out: Record<string, string> = {};
  for (const n of names) {
    const v = process.env[n];
    if (!v) fail(`${n} is required.`);
    out[n] = v as string;
  }
  return out;
}

export function fail(message: string): never {
  console.error(`Refusing: ${message}`);
  process.exit(1);
}

export function serviceClient(env: Record<string, string>) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SECRET_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** research.md R-02: >= 8 characters with lowercase, uppercase and digits. */
export function passwordPolicyOk(p: string): boolean {
  return p.length >= 8 && p.length <= 256 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p);
}

/**
 * Reads a password without echo from a TTY. Never from argv or the environment; never logged or stored.
 * When stdin is not a TTY (automated tests) one line is read from stdin instead.
 */
export async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      rl.close();
      return line;
    }
    return "";
  }
  process.stdout.write(question);
  return new Promise<string>((resolve) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}
