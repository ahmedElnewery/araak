import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TenantIdentity } from "./tenant-identity";

describe("TenantIdentity (FR-035)", () => {
  it("renders the neutral decorative icon when there is no logo, with no default artwork", () => {
    const html = renderToStaticMarkup(<TenantIdentity name="جمعية الأمل" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/src=|url\(|powered|logo/i);
    expect(html).toContain("جمعية الأمل");
  });
  it("uses the organization name as the logo's alt text", () => {
    const html = renderToStaticMarkup(<TenantIdentity name="Hope Org" logoSrc="/branding/logo?v=3" />);
    expect(html).toContain('alt="Hope Org"');
    expect(html).toContain('src="/branding/logo?v=3"');
  });
  it("shows the name with automatic direction so mixed scripts render correctly", () => {
    expect(renderToStaticMarkup(<TenantIdentity name="Hope" />)).toContain('dir="auto"');
  });
});
