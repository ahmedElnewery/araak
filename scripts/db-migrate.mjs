// Applies the pending supabase/migrations/*.sql to the Development project through the Supabase Management API (no
// database URL, Docker or CLI). History is kept in supabase_migrations.schema_migrations, the table the Supabase CLI
// uses. Each migration runs in one transaction together with its history row: a failure rolls that file back and stops.
//
//   pnpm db:migrate                         apply every pending migration, in file order
//   pnpm db:migrate --dry-run               only show what is applied and what is pending
//   pnpm db:migrate --baseline <version>    first record every migration up to <version> as applied WITHOUT running it
//                                           (once, for a database whose migrations were applied by hand)
//
// Reads .env.local at the repository root when present: SUPABASE_ENV=development, SUPABASE_DEV_PROJECT_REF,
// SUPABASE_ACCESS_TOKEN (personal access token), optionally SUPABASE_PROD_PROJECT_REF and NEXT_PUBLIC_SUPABASE_URL.
import { existsSync, readdirSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
await import("./assert-dev-environment.mjs"); // exits unless the target is the Development project

const fail = (m) => {
  console.error(m);
  process.exit(1);
};
const ref = process.env.SUPABASE_DEV_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) fail("SUPABASE_ACCESS_TOKEN is not set (Supabase dashboard: Account, Access Tokens).");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const b = args.indexOf("--baseline");
const baseline = b === -1 ? null : args[b + 1];
if (b !== -1 && !baseline) fail("--baseline needs a version, e.g. --baseline 20261015150037");

const api = `https://api.supabase.com/v1/projects/${ref}/database/query`;
async function query(sql) {
  const res = await fetch(api, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 1500)}`);
  return text ? JSON.parse(text) : [];
}
const lit = (s) => `'${s.replaceAll("'", "''")}'`;

const dir = "supabase/migrations";
const local = readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort()
  .map((file) => ({
    file,
    version: file.slice(0, file.indexOf("_")),
    name: file.slice(file.indexOf("_") + 1, -".sql".length),
  }));
const dup = local.find((m, i) => i > 0 && local[i - 1].version === m.version);
if (dup)
  fail(`Two migrations share version ${dup.version}; give each file a unique version first.`);
const dupName = local.find((m, i) => local.findIndex((o) => o.name === m.name) !== i);
if (dupName)
  fail(
    `Two migrations share the name ${dupName.name}; names must be unique (they identify applied files).`,
  );

const [state] = await query(
  `select to_regclass('supabase_migrations.schema_migrations') is not null as has_history,
          to_regclass('public.tenants') is not null as initialized`,
);
const recorded = state.has_history
  ? await query(
      "select version, to_jsonb(s)->>'name' as name from supabase_migrations.schema_migrations s",
    )
  : [];
// A file counts as applied when its version or its name is recorded: the Management API's migrations endpoint records
// the time of application as the version, under the file's name.
const versions = new Set(recorded.map((r) => r.version));
const names = new Set(recorded.map((r) => r.name));
const applied = new Set(
  local.filter((m) => versions.has(m.version) || names.has(m.name)).map((m) => m.version),
);
const ensureHistory = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;`;
const historyRow = (m) => `(${lit(m.version)}, ${lit(m.name)})`;

if (baseline) {
  if (!local.some((m) => m.version === baseline))
    fail(`--baseline ${baseline} is not the version of a file in ${dir}.`);
  const marked = local.filter((m) => m.version <= baseline && !applied.has(m.version));
  if (marked.length > 0 && !dryRun) {
    await query(`${ensureHistory}
insert into supabase_migrations.schema_migrations (version, name) values ${marked.map(historyRow).join(", ")}
on conflict (version) do nothing;`);
  }
  for (const m of marked) {
    applied.add(m.version);
    console.log(`${dryRun ? "would mark" : "marked"} as applied (not run): ${m.file}`);
  }
}

const pending = local.filter((m) => !applied.has(m.version));
console.log(`${local.length - pending.length} applied, ${pending.length} pending`);
if (pending.length === 0) process.exit(0);
// A schema without matching history means the files were applied by hand: running 001 again would fail or, worse,
// replace newer function definitions with older ones. Make the operator say what is already there.
if (state.initialized && pending[0] === local[0]) {
  fail(`The database already has the schema, but its history does not list ${local[0].file}.
Record what is already applied once: pnpm db:migrate --baseline <version of the last applied file> --dry-run, then without --dry-run.`);
}
if (dryRun) {
  for (const m of pending) console.log(`pending ${m.file}`);
  process.exit(0);
}

await query(ensureHistory);
for (const m of pending) {
  try {
    await query(`begin;
${readFileSync(`${dir}/${m.file}`, "utf8")}
;
insert into supabase_migrations.schema_migrations (version, name) values ${historyRow(m)};
commit;`);
    console.log(`ok      ${m.file}`);
  } catch (e) {
    fail(`FAILED  ${m.file} (rolled back; the files before it stay applied)\n${e.message}`);
  }
}
