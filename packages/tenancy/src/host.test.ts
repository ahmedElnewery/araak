import { describe, expect, it } from "vitest";
import { classifyHost, type HostConfig } from "./host";

const cfg: HostConfig = { portalBaseDomain: "portal.localhost:3000", adminHost: "admin.localhost:3001", trustedProxyHops: 0 };
const h = (headers: Record<string, string>) => ({ get: (n: string) => headers[n.toLowerCase()] ?? null });
const classify = (host: string, extra: Record<string, string> = {}, c: HostConfig = cfg) => classifyHost(h({ host, ...extra }), c);

describe("classifyHost", () => {
  it("resolves a tenant subdomain, ignoring the port", () => {
    expect(classify("tenant-a.portal.localhost:3000")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
    expect(classify("tenant-a.portal.localhost")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
  });
  it("lowercases and strips a trailing dot", () => {
    expect(classify("Tenant-A.Portal.Localhost:3000")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
    expect(classify("tenant-a.portal.localhost.:3000")).toEqual({ kind: "tenant", subdomain: "tenant-a" });
  });
  it("recognizes only the exact admin host (the portal classifier reports it as admin, not tenant)", () => {
    expect(classify("admin.localhost:3001")).toEqual({ kind: "admin" });
    expect(classify("x.admin.localhost:3001")).toEqual({ kind: "invalid" });
  });
  it("rejects nested labels, unknown bases, bare base, IP literals, IDN and odd syntax", () => {
    for (const host of [
      "a.b.portal.localhost:3000", "tenant-a.evil.test", "portal.localhost:3000", "127.0.0.1:3000", "[::1]:3000",
      "xn--abc.portal.localhost", "тест.portal.localhost", "a@b.portal.localhost", "tenant-a.portal.localhost:abc",
      "tenant-a.portal.localhost/", "-a.portal.localhost", "a-.portal.localhost", "", "tenant-a..portal.localhost",
    ]) {
      expect(classify(host)).toEqual({ kind: "invalid" });
    }
  });
  it("rejects reserved subdomains", () => {
    expect(classify("www.portal.localhost:3000")).toEqual({ kind: "invalid" });
    expect(classify("admin.portal.localhost:3000")).toEqual({ kind: "invalid" });
  });
  it("ignores a spoofed X-Forwarded-Host when no proxy is trusted", () => {
    expect(classify("tenant-a.portal.localhost:3000", { "x-forwarded-host": "tenant-b.portal.localhost:3000" })).toEqual({
      kind: "tenant",
      subdomain: "tenant-a",
    });
  });
  it("uses the last X-Forwarded-Host value only when a proxy is trusted", () => {
    const trusted = { ...cfg, trustedProxyHops: 1 };
    expect(classify("internal:3000", { "x-forwarded-host": "tenant-b.portal.localhost:3000" }, trusted)).toEqual({ kind: "tenant", subdomain: "tenant-b" });
    expect(classify("internal:3000", { "x-forwarded-host": "tenant-a.portal.localhost, tenant-b.portal.localhost" }, trusted)).toEqual({ kind: "tenant", subdomain: "tenant-b" });
  });
  it("rejects a missing host header", () => {
    expect(classifyHost(h({}), cfg)).toEqual({ kind: "invalid" });
  });
});
