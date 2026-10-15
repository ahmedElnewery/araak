// T151 logo storage hardening (FR-034, FR-035, Constitution IX): server-side rejection, tenant isolation through the
// Storage API, the host-bound logo route, and private buckets. Runs against the Development project.
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { processLogo } from "../../packages/config/src/server/logo";
import { adminClient } from "../helpers/clients";
import { sql } from "../helpers/db";
import { createTwoTenantFixture, type TwoTenantFixture } from "../helpers/fixtures";

let currentTenant: { id: string; subdomain: string; displayName: string; state: "active"; logoVersion: number; hasLogo: boolean } | null = null;
vi.mock("../../packages/tenancy/src/server/index.ts", () => ({ resolveTenantFromHost: async () => currentTenant }));

let fx: TwoTenantFixture;
const png = (w = 128, h = 128) => sharp({ create: { width: w, height: h, channels: 3, background: "#087e89" } }).png().toBuffer();
const objects: { bucket: string; path: string }[] = [];

async function put(bucket: string, path: string, bytes: Buffer, contentType = "image/png") {
  const { error } = await adminClient().storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
  expect(error).toBeNull();
  objects.push({ bucket, path });
}
const host = (t: TwoTenantFixture["tenantA"]) => ({ id: t.id, subdomain: t.subdomain, displayName: "x", state: "active" as const, logoVersion: 1, hasLogo: true });

beforeAll(async () => {
  fx = await createTwoTenantFixture();
});
afterAll(async () => {
  for (const o of objects) await adminClient().storage.from(o.bucket).remove([o.path]).catch(() => undefined);
  await fx?.teardown();
});

describe("server-side logo validation", () => {
  it("rejects a disallowed MIME, an extension mismatch, an oversized file, corrupt data and oversized dimensions", async () => {
    const good = await png();
    expect((await processLogo({ bytes: Buffer.from("<svg/>"), declaredMime: "image/svg+xml", fileName: "a.svg" }))).toEqual({ ok: false, code: "logo_type" });
    expect(await processLogo({ bytes: good, declaredMime: "image/png", fileName: "a.jpg" })).toEqual({ ok: false, code: "logo_mismatch" });
    expect(await processLogo({ bytes: Buffer.concat([good, Buffer.alloc(1024 * 1024)]), declaredMime: "image/png", fileName: "a.png" })).toEqual({ ok: false, code: "logo_too_large" });
    expect(await processLogo({ bytes: good.subarray(0, 40), declaredMime: "image/png", fileName: "a.png" })).toEqual({ ok: false, code: "logo_corrupt" });
    expect(await processLogo({ bytes: await png(1500, 200), declaredMime: "image/png", fileName: "a.png" })).toEqual({ ok: false, code: "logo_dimensions" });
  });
});

describe("tenant isolation through the Storage API", () => {
  it("a tenant-A JWT cannot list or read tenant-logos/<B>/… or tenant-private/<B>/…", async () => {
    const bytes = await png();
    const bLogo = `${fx.tenantB.id}/${crypto.randomUUID()}.png`;
    const bPrivate = `${fx.tenantB.id}/secret.png`;
    await put("tenant-logos", bLogo, bytes);
    await put("tenant-private", bPrivate, bytes);
    const { client } = await fx.managerA.signIn();
    for (const [bucket, path] of [["tenant-logos", bLogo], ["tenant-private", bPrivate]] as const) {
      const list = await client.storage.from(bucket).list(fx.tenantB.id);
      expect(list.error !== null || (list.data ?? []).length === 0).toBe(true);
      const read = await client.storage.from(bucket).download(path);
      expect(read.data).toBeNull();
    }
    // even its own tenant-logos folder has no client policy: only server code reads logos
    const own = `${fx.tenantA.id}/${crypto.randomUUID()}.png`;
    await put("tenant-logos", own, bytes);
    expect((await client.storage.from("tenant-logos").download(own)).data).toBeNull();
  });
  it("the buckets are not public", async () => {
    const rows = await sql<{ id: string; public: boolean }>(`select id, public from storage.buckets where id in ('tenant-logos','tenant-private')`);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.public)).toBe(true);
  });
});

describe("/branding/logo route", () => {
  it("serves only the host tenant's logo, with nosniff and a version-keyed private cache", async () => {
    const { GET } = await import("../../apps/portal/src/app/branding/logo/route");
    const a = `${fx.tenantA.id}/${crypto.randomUUID()}.png`;
    const b = `${fx.tenantB.id}/${crypto.randomUUID()}.png`;
    await put("tenant-logos", a, await png(128, 128));
    await put("tenant-logos", b, await png(200, 200));
    await sql(`update public.tenants set logo_object_path = '${a}', logo_version = 1 where id = '${fx.tenantA.id}';
               update public.tenants set logo_object_path = '${b}', logo_version = 1 where id = '${fx.tenantB.id}'`);

    currentTenant = host(fx.tenantA);
    const resA = await GET();
    expect(resA.status).toBe(200);
    expect(resA.headers.get("x-content-type-options")).toBe("nosniff");
    expect(resA.headers.get("cache-control")).toMatch(/immutable/);
    expect((await sharp(Buffer.from(await resA.arrayBuffer())).metadata()).width).toBe(128);

    currentTenant = host(fx.tenantB);
    expect((await sharp(Buffer.from(await (await GET()).arrayBuffer())).metadata()).width).toBe(200);

    // defence in depth: a row that points at ANOTHER tenant's object is never served on host A
    await sql(`update public.tenants set logo_object_path = '${b}' where id = '${fx.tenantA.id}'`);
    currentTenant = host(fx.tenantA);
    expect((await GET()).status).toBe(404);

    // no logo, or an unknown host: 404 with no body
    currentTenant = { ...host(fx.tenantA), hasLogo: false };
    expect((await GET()).status).toBe(404);
    currentTenant = null;
    expect((await GET()).status).toBe(404);
  });
});
