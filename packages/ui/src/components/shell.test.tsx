import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountMenu } from "./account-menu";
import { AppearancePicker } from "./appearance-picker";
import { AppShell, type ShellLinkProps, type ShellNavGroup, type ShellSection } from "./app-shell";
import { LtrText } from "./ltr-text";
import { StatusPage } from "./status-page";
import { TenantIdentity } from "./tenant-identity";
import { initials } from "../lib/initials";

const Link = ({ href, children, ...rest }: ShellLinkProps & { children: ReactNode }) => <a href={href} {...rest}>{children}</a>;
const labels = { skipToContent: "Skip", openMenu: "Open", closeMenu: "Close", collapseMenu: "Collapse", expandMenu: "Expand", backToMenu: "Back" };
const nav: ShellNavGroup[] = [
  { id: "main", label: "MAIN", items: [{ id: "home", href: "/", label: "Home", active: true }] },
  {
    id: "system", label: "SYSTEM",
    items: [{ id: "settings", href: "/settings", label: "Settings", children: [{ id: "staff", href: "/settings/staff", label: "Staff" }] }],
  },
];
const shell = (section?: ShellSection, defaultCollapsed?: boolean) =>
  renderToStaticMarkup(
    <AppShell dir="rtl" brand="BRAND" account="ACCOUNT" nav={nav} navLabel="Primary" section={section} link={Link} labels={labels} defaultCollapsed={defaultCollapsed}>
      CONTENT
    </AppShell>,
  );

describe("shell components", () => {
  it("AppShell renders a skip link, the top bar (brand, account), primary nav and main landmark", () => {
    const html = shell();
    expect(html).toContain('href="#main-content"');
    expect(html).toContain("BRAND");
    expect(html).toContain("ACCOUNT");
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('aria-label="Open"');
  });
  it("groups the primary nav under labelled headings, marks the current page and links parents to their first section", () => {
    const html = shell();
    expect(html).toContain(">MAIN<");
    expect(html).toContain(">SYSTEM<");
    expect(html).toMatch(/<a href="\/" aria-current="page"/);
    expect(html).toContain('href="/settings/staff"');
  });
  it("renders the secondary sidebar only for a section", () => {
    expect(shell()).not.toContain("SECTION");
    const html = shell({ title: "SECTION", label: "Section links", items: [{ id: "staff", href: "/settings/staff", label: "Staff", active: true }] });
    expect(html).toContain("SECTION");
    expect(html).toContain('aria-label="Section links"');
  });
  it("starts collapsed from the cookie value and labels the toggle accordingly", () => {
    expect(shell(undefined, true)).toContain('data-collapsed="true"');
    expect(shell(undefined, true)).toContain('aria-label="Expand"');
    expect(shell()).toContain('aria-label="Collapse"');
  });
  it("uses logical properties only (no physical left/right utilities)", () => {
    expect(shell({ title: "S", label: "S", items: [] })).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-\d/);
  });
  it("AccountMenu shows initials and the name in the trigger and keeps the sign-out form outside the menu", () => {
    const html = renderToStaticMarkup(
      <AccountMenu dir="rtl" name="Hope" initials="HO" label="Account" link={Link} signOut={{ label: "Sign out", action: () => undefined }} />,
    );
    expect(html).toContain("HO");
    expect(html).toContain("Hope");
    expect(html).toContain("<form");
    expect(html).toContain('data-testid="account-menu"');
  });
  it("AppearancePicker renders native radio groups with the current choices checked", () => {
    const html = renderToStaticMarkup(
      <AppearancePicker
        theme="dark" locale="en" onThemeChange={() => undefined} onLocaleChange={() => undefined}
        labels={{ theme: "Theme", themeHint: "h", light: "Light", dark: "Dark", system: "System", language: "Language", languageHint: "h" }}
      />,
    );
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html).toMatch(/checked="" value="dark"/);
    expect(html).toMatch(/checked="" value="en"/);
    expect(html).toContain('lang="ar"');
  });
  it("initials take the first letters of the first and last name, skipping the Arabic definite article", () => {
    expect(initials("أحمد", "النويري", "managera")).toBe("أن");
    expect(initials("Sara", "Mahmoud", "sara")).toBe("SM");
    expect(initials(null, null, "managera")).toBe("MA");
    expect(initials("Ali", "", "ali.k")).toBe("AL");
  });
  it("TenantIdentity shows the logo with alt text, or a neutral decorative icon", () => {
    const withLogo = renderToStaticMarkup(<TenantIdentity name="Hope" logoSrc="/logo?v=1" />);
    expect(withLogo).toContain('alt="Hope"');
    const without = renderToStaticMarkup(<TenantIdentity name="Hope" />);
    expect(without).toContain('aria-hidden="true"');
    expect(without).not.toContain("<img");
    expect(without).toContain("Hope");
  });
  it("LtrText isolates direction and StatusPage carries no branding", () => {
    expect(renderToStaticMarkup(<LtrText>a@b.c</LtrText>)).toBe('<bdi dir="ltr">a@b.c</bdi>');
    expect(renderToStaticMarkup(<StatusPage title="T" body="B" />)).not.toMatch(/powered|logo/i);
  });
});
