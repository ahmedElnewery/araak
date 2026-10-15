import { describe, expect, it } from "vitest";
import { classifyHost, type HostConfig } from "./host";

// Same shape as production: tenants directly under the base, the Araak organization at `portal.`, the admin app at `admin.`.
const cfg: HostConfig = { portalBaseDomain: "localhost:3000", adminHost: "admin.localhost:3001", trustedProxyHops: 0 };
const h = (headers: Record<string, string>) => ({ get: (n: string) => headers[n.toLowerCase()] ?? null });
const classify = (host: string, extra: Record<string, string> = {}, c: HostConfig = cfg) => classifyHost(h({ host, ...extra }), c);

describe("classifyHost", () => {
  it("resolves a tenant subdomain, ignoring the port", () => {
    expect(classify("tenant-a.localhost:3000")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
    expect(classify("tenant-a.localhost")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
  });
  it("serves the Araak organization at portal.<base> like any other tenant", () => {
    expect(classify("portal.localhost:3000")).toEqual({ kind: "tenant", subdomain: "portal" });
    expect(classify("noor.localhost:3000")).toEqual({ kind: "tenant", subdomain: "noor" });
  });
  it("lowercases and strips a trailing dot", () => {
    expect(classify("Tenant-A.Localhost:3000")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
    expect(classify("tenant-a.localhost.:3000")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
  });
  it("recognizes only the exact admin host (the portal classifier reports it as admin, not tenant)", () => {
    expect(classify("admin.localhost:3001")).toEqual({ kind: "admin" });
    expect(classify("x.admin.localhost:3001")).toEqual({ kind: "invalid" });
  });
  it("rejects nested labels, unknown bases, bare base, IP literals, IDN and odd syntax", () => {
    for (const host of [
      "a.b.localhost:3000", "tenant-a.evil.test", "localhost:3000", "127.0.0.1:3000", "[::1]:3000",
      "xn--abc.localhost", "тест.localhost", "a@b.localhost", "tenant-a.localhost:abc",
      "tenant-a.localhost/", "-a.localhost", "a-.localhost", "", "tenant-a..localhost",
    ]) {
      expect(classify(host)).toEqual({ kind: "invalid" });
    }
  });
  it("rejects reserved subdomains", () => {
    expect(classify("www.localhost:3000")).toEqual({ kind: "invalid" });
    expect(classify("araak.localhost:3000")).toEqual({ kind: "invalid" });
  });
  it("ignores a spoofed X-Forwarded-Host when no proxy is trusted", () => {
    expect(classify("tenant-a.localhost:3000", { "x-forwarded-host": "tenant-b.localhost:3000" })).toEqual({
      kind: "tenant",
      subdomain: "tenant-a",
    });
  });
  it("uses the last X-Forwarded-Host value only when a proxy is trusted", () => {
    const trusted = { ...cfg, trustedProxyHops: 1 };
    expect(classify("internal:3000", { "x-forwarded-host": "tenant-b.localhost:3000" }, trusted)).toEqual({ kind: "tenant", subdomain: "tenant-b" });
    expect(classify("internal:3000", { "x-forwarded-host": "tenant-a.localhost, tenant-b.localhost" }, trusted)).toEqual({ kind: "tenant", subdomain: "tenant-b" });
  });
  it("rejects a missing host header", () => {
    expect(classifyHost(h({}), cfg)).toEqual({ kind: "invalid" });
  });
  it("works when an app configures only its own side", () => {
    const adminOnly: HostConfig = { portalBaseDomain: "", adminHost: "admin.localhost:3001", trustedProxyHops: 0 };
    expect(classify("admin.localhost:3001", {}, adminOnly)).toEqual({ kind: "admin" });
    expect(classify("tenant-a.localhost:3000", {}, adminOnly)).toEqual({ kind: "invalid" });
    const portalOnly: HostConfig = { portalBaseDomain: "localhost:3000", adminHost: "", trustedProxyHops: 0 };
    expect(classify("tenant-a.localhost:3000", {}, portalOnly)).toEqual({ kind: "tenant", subdomain: "tenant-a" });
    expect(classify("admin.localhost:3001", {}, portalOnly)).toEqual({ kind: "invalid" });
  });
  it("classifies a production domain the same way", () => {
    const prod: HostConfig = { portalBaseDomain: "example.org", adminHost: "admin.example.org", trustedProxyHops: 0 };
    expect(classify("portal.example.org", {}, prod)).toEqual({ kind: "tenant", subdomain: "portal" });
    expect(classify("noor.example.org", {}, prod)).toEqual({ kind: "tenant", subdomain: "noor" });
    expect(classify("admin.example.org", {}, prod)).toEqual({ kind: "admin" });
    for (const host of ["example.org", "www.example.org", "a.b.example.org"]) expect(classify(host, {}, prod)).toEqual({ kind: "invalid" });
  });
});
