// The TypeScript catalog and email normalization must match the database (the database is authoritative).
import { describe, expect, it } from "vitest";
import { MANAGER_ONLY_KEYS, SUPPORTED_SCOPES, TENANT_GRANTABLE_KEYS } from "../../packages/authorization/src/catalog";
import { normalizeEmail } from "../../packages/auth/src/email/normalize";
import { RESERVED_SUBDOMAINS } from "../../packages/tenancy/src/reserved-subdomains";
import { sql } from "../helpers/db";

describe("TS <-> DB parity", () => {
  it("permission catalog matches the seed", async () => {
    const rows = await sql<{ key: string; tenant_grantable: boolean; supports_scopes: string }>(
      `select key, tenant_grantable, supports_scopes::text from public.permission_catalog order by key`);
    const db = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(Object.keys(db).sort()).toEqual([...TENANT_GRANTABLE_KEYS, ...MANAGER_ONLY_KEYS].sort());
    for (const k of TENANT_GRANTABLE_KEYS) {
      expect(db[k]!.tenant_grantable).toBe(true);
      expect(db[k]!.supports_scopes).toBe(`{${SUPPORTED_SCOPES[k].join(",")}}`);
    }
    for (const k of MANAGER_ONLY_KEYS) expect(db[k]!.tenant_grantable).toBe(false);
  });
  it("reserved subdomains match", async () => {
    const rows = await sql<{ name: string }>(`select name from private.reserved_subdomains`);
    expect(rows.map((r) => r.name).sort()).toEqual([...RESERVED_SUBDOMAINS].sort());
  });
  it("normalize_email matches", async () => {
    const samples = ["  Ahmed@Example.ORG ", "A.b+tag@x.org", "ÄÖ@Bücher.DE", "x@y.z", "\tMIXED@Case.Test\n", "\u00a0nb@sp.test\u3000", "\ufeffbom@x.test", "in ner@x.test"];
    for (const s of samples) {
      const [row] = await sql<{ n: string }>(`select private.normalize_email(convert_from(decode('${Buffer.from(s).toString("hex")}','hex'),'UTF8')) as n`);
      expect(row!.n).toBe(normalizeEmail(s));
    }
  });
});
