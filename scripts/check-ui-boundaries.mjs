import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const failures = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".turbo") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;
const imports = (file) => [...readFileSync(file, "utf8").matchAll(importRe)].map((m) => m[1]);

for (const app of ["portal", "admin"]) {
  const appDir = join(root, "apps", app);
  if (existsSync(join(appDir, "src/components/ui"))) {
    failures.push(`apps/${app}/src/components/ui must not exist; shadcn components live in packages/ui`);
  }
  for (const f of walk(join(appDir, "src"))) {
    for (const spec of imports(f)) {
      if (spec.startsWith("@radix-ui/") || spec === "radix-ui") {
        failures.push(`${f.replace(root, "")}: direct import of ${spec}`);
      }
    }
  }
}

const forbidden = [/^@supabase\//, /^@workspace\/(auth|db|authorization)(\/|$)/];
for (const f of walk(join(root, "packages/ui/src"))) {
  for (const spec of imports(f)) {
    if (forbidden.some((re) => re.test(spec))) {
      failures.push(`${f.replace(root, "")}: packages/ui must not import ${spec}`);
    }
  }
}

if (failures.length) {
  console.error("UI boundary violations:\n" + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log("UI boundaries OK");
