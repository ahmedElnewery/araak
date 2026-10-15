import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const failures = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function isServiceRoleJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

const jwtRe = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const needles = ["SUPABASE_SECRET_KEY", "@workspace/auth/server", "@workspace/config/server"];

for (const app of ["portal", "admin"]) {
  const dir = join(root, "apps", app, ".next/static");
  for (const f of walk(dir)) {
    const text = readFileSync(f, "utf8");
    const rel = f.replace(root, "");
    for (const n of needles) if (text.includes(n)) failures.push(`${rel}: contains ${n}`);
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) failures.push(`${rel}: contains a Supabase secret key`);
    for (const m of text.matchAll(jwtRe)) {
      if (isServiceRoleJwt(m[0])) failures.push(`${rel}: contains a service_role JWT`);
    }
  }
}

if (failures.length) {
  console.error("Client bundle leaks:\n" + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log("Client bundles OK");
