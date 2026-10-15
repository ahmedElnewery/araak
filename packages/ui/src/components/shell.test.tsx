import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";
import { LtrText } from "./ltr-text";
import { StatusPage } from "./status-page";
import { TenantIdentity } from "./tenant-identity";

const labels = { skipToContent: "Skip", openMenu: "Open", closeMenu: "Close" };
const shell = (secondaryNav?: string) =>
  renderToStaticMarkup(
    <AppShell dir="rtl" brand="BRAND" primaryNav={<nav>PRIMARY</nav>} secondaryNav={secondaryNav} header="HEADER" labels={labels}>
      CONTENT
    </AppShell>,
  );

describe("shell components", () => {
  it("AppShell renders a skip link, primary nav, header and main landmark", () => {
    const html = shell();
    expect(html).toContain('href="#main-content"');
    expect(html).toContain("PRIMARY");
    expect(html).toContain("HEADER");
    expect(html).toContain('id="main-content"');
    expect(html).toContain('aria-label="Open"');
  });
  it("renders the secondary sidebar only when provided", () => {
    expect(shell()).not.toContain("SECONDARY");
    expect(shell("SECONDARY")).toContain("SECONDARY");
  });
  it("uses logical properties only (no physical left/right utilities)", () => {
    expect(shell("S")).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-\d/);
  });
  it("TenantIdentity shows the logo with alt text, or a neutral decorative icon", () => {
    const withLogo = renderToStaticMarkup(<TenantIdentity name="Hope" logoSrc="/logo?v=1" logoAlt="Organization logo" />);
    expect(withLogo).toContain('alt="Organization logo"');
    const without = renderToStaticMarkup(<TenantIdentity name="Hope" logoAlt="Organization logo" />);
    expect(without).toContain('aria-hidden="true"');
    expect(without).not.toContain("<img");
    expect(without).toContain("Hope");
  });
  it("LtrText isolates direction and StatusPage carries no branding", () => {
    expect(renderToStaticMarkup(<LtrText>a@b.c</LtrText>)).toBe('<bdi dir="ltr">a@b.c</bdi>');
    expect(renderToStaticMarkup(<StatusPage title="T" body="B" />)).not.toMatch(/powered|logo/i);
  });
});
