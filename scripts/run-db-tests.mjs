// Runs the pgTAP-style files in supabase/tests/*.test.sql against the Development project through the
// Supabase Management API (no database URL, Docker or CLI). Each file runs in one request:
// prelude + file + a final DO block that raises the collected results as an error, which rolls
// the whole transaction back so no fixture data survives.
import { readdirSync, readFileSync } from "node:fs";

const ref = process.env.SUPABASE_DEV_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (process.env.SUPABASE_ENV !== "development") throw new Error("SUPABASE_ENV must be 'development'");
if (!ref || !token) throw new Error("SUPABASE_DEV_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required");
if (process.env.SUPABASE_PROD_PROJECT_REF === ref) throw new Error("Refusing: dev ref equals prod ref");

const api = `https://api.supabase.com/v1/projects/${ref}/database/query`;
async function run(query) {
  const res = await fetch(api, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, text: await res.text() };
}

const dir = "supabase/tests";
const prelude = readFileSync(`${dir}/_prelude.sql`, "utf8");
const filter = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith(".test.sql") && (!filter || f.includes(filter))).sort();
const trailer = `
do $collect$
declare r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_array(numb, coalesce(ok, false), descr) order by numb), '[]') into r from tests.results;
  raise exception 'PGTAP_RESULT %', r;
end $collect$;`;

let failed = 0;
for (const f of files) {
  const { text } = await run(`begin;\n${prelude}\n${readFileSync(`${dir}/${f}`, "utf8")}\n${trailer}`);
  const m = /PGTAP_RESULT (\[.*\])/s.exec(text.replace(/\\"/g, '"').replace(/\\n/g, " "));
  if (!m) {
    failed++;
    console.log(`FAIL ${f}: ${text.slice(0, 600)}`);
    continue;
  }
  const rows = JSON.parse(m[1]);
  const bad = rows.filter((r) => !r[1]);
  console.log(`${bad.length ? "FAIL" : "ok  "} ${f}: ${rows.length - bad.length}/${rows.length} assertions`);
  for (const r of bad) console.log(`    not ok ${r[0]} - ${r[2]}`);
  if (bad.length || rows.length === 0) failed++;
}
process.exit(failed ? 1 : 0);
