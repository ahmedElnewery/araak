import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LinkProps } from "../lib/link";
import { Avatar } from "./avatar";
import { DataTable, type DataColumn } from "./data-table";
import { EmptyState } from "./empty-state";
import { FilterBar, FilterMenu, FilterOption, FilterSearch } from "./filter-bar";
import { ListCard, ListCardItem } from "./list-card";
import { PageContainer, PageHeader } from "./page-header";
import { PaginationBar, pageWindow } from "./pagination-bar";
import { RouteTabs } from "./route-tabs";
import { SettingsSection, SettingsSections } from "./settings-section";
import { StatusBadge, Tag } from "./status-badge";

const Link = ({ href, children, ...rest }: LinkProps) => <a href={href} {...rest}>{children}</a>;
const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("PageHeader and PageContainer", () => {
  it("renders the breadcrumb with links for ancestors, the current page last, one h1 and the actions", () => {
    const out = html(
      <PageHeader
        titleId="t" title="Staff" description="People in your organization" link={Link} actions={<button type="button">Invite</button>}
        breadcrumb={{ label: "Breadcrumb", items: [{ label: "Settings", href: "/settings" }, { label: "Staff" }] }}
      />,
    );
    expect(out).toContain('<nav aria-label="Breadcrumb">');
    expect(out).toContain('<a href="/settings"');
    expect(out).toContain('<span aria-current="page">Staff</span>');
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('id="t"');
    expect(out).toContain("People in your organization");
    expect(out).toContain("Invite");
  });
  it("omits a one-item breadcrumb and labels the page section by its title", () => {
    expect(html(<PageHeader titleId="t" title="Home" breadcrumb={{ label: "B", items: [{ label: "Home" }] }} />)).not.toContain("<nav");
    const page = html(<PageContainer labelledBy="t" width="narrow">x</PageContainer>);
    expect(page).toContain('aria-labelledby="t"');
    expect(page).toContain("max-w-[60rem]");
  });
});

type Row = { id: string; name: string; state: string };
const columns: DataColumn<Row>[] = [
  { id: "name", header: "Name", primary: true, cell: (r) => r.name, sort: { href: "/staff?sort=name&dir=desc", direction: "asc" } },
  { id: "state", header: "State", label: "State", cell: (r) => r.state, sort: { href: "/staff?sort=state" } },
  { id: "open", header: "Open", srOnlyHeader: true, hideOnMobile: true, align: "end", cell: () => "›" },
];

describe("DataTable", () => {
  const table = html(
    <DataTable columns={columns} rows={[{ id: "1", name: "Sara", state: "Active" }]} rowKey={(r) => r.id} caption="Staff" link={Link} rowProps={() => ({ "data-testid": "staff-row" })} />,
  );
  it("keeps table semantics through explicit roles and names the table", () => {
    expect(table).toContain('role="table" aria-label="Staff"');
    expect(table).toContain('role="columnheader"');
    expect(table.match(/role="cell"/g)).toHaveLength(3);
    expect(table).toContain('data-testid="staff-row"');
  });
  it("marks the sorted column and links every sortable header", () => {
    expect(table).toContain('aria-sort="ascending"');
    expect(table).toContain('aria-sort="none"');
    expect(table).toContain('href="/staff?sort=name&amp;dir=desc"');
  });
  it("labels values for the phone layout but not the row title", () => {
    expect(table).toContain('data-label="State"');
    expect(table).not.toContain('data-label="Name"');
    expect(table).toContain('<span class="sr-only">Open</span>');
  });
  it("shows the empty state instead of an empty table", () => {
    const out = html(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} caption="Staff" empty={<EmptyState title="No staff yet" />} />);
    expect(out).toContain("No staff yet");
    expect(out).not.toContain('role="table"');
  });
});

describe("PaginationBar", () => {
  it("keeps the first, last and neighbouring pages, filling a one-page gap", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, "gap", 5]);
    expect(pageWindow(5, 16)).toEqual([1, "gap", 4, 5, 6, "gap", 16]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  const labels = { pagination: "Pages", previous: "Previous", next: "Next", pageOf: "Page {page} of {pages}" };
  it("links pages, marks the current one and disables the step that leads nowhere", () => {
    const out = html(<PaginationBar page={1} pages={3} href={(p) => `/audit?page=${String(p)}`} link={Link} labels={labels} summary="3 pages" />);
    expect(out).toMatch(/<nav aria-label="Pages"/);
    expect(out).toContain(">Page 1 of 3</li>");
    expect(out).toMatch(/aria-current="page" aria-label="Page 1 of 3"/);
    expect(out).toMatch(/<span aria-disabled="true"[^>]*>Previous<\/span>/);
    expect(out).toContain('href="/audit?page=2"');
    expect(out).toContain("3 pages");
  });
  it("shows only the summary for a single page", () => {
    const out = html(<PaginationBar page={1} pages={1} href={() => "/"} link={Link} labels={labels} summary="1 result" />);
    expect(out).not.toContain("<nav");
    expect(out).toContain("1 result");
  });
});

describe("FilterBar", () => {
  const bar = html(
    <FilterBar action="/audit" label="Filters" submitLabel="Apply" link={Link} keep={{ actor: "abc", sort: null }} clear={{ href: "/audit", label: "Clear" }}>
      <FilterSearch id="q" name="q" label="Search" defaultValue="role" />
      <FilterMenu label="Categories" value="All">
        <FilterOption name="category" value="staff" label="Staff" defaultChecked count={4} />
      </FilterMenu>
    </FilterBar>,
  );
  it("is a GET search form for the list's own URL that keeps the parameters it is given", () => {
    expect(bar).toMatch(/<form [^>]*role="search"/);
    for (const attr of ['action="/audit"', 'method="get"', 'aria-label="Filters"']) expect(bar).toContain(attr);
    expect(bar).toContain('<input type="hidden" name="actor" value="abc"/>');
    expect(bar).not.toContain('name="sort"');
  });
  it("has a labelled search field, filter menus whose fields stay in the form, and a clear link", () => {
    expect(bar).toContain('<label for="q" class="sr-only">Search</label>');
    expect(bar).toContain('value="role"');
    expect(bar).toContain("<details");
    const option = /<input type="checkbox"[^>]*>/.exec(bar)?.[0] ?? "";
    for (const attr of ['name="category"', 'value="staff"', 'checked=""']) expect(option).toContain(attr);
    expect(bar).toContain('<a href="/audit"');
  });
});

describe("small pieces", () => {
  it("StatusBadge names the state in text, the tone is only colour", () => {
    const out = html(<StatusBadge tone="success" dot>Active</StatusBadge>);
    expect(out).toContain("bg-success-soft text-success");
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain("Active");
    expect(html(<Tag>Finance</Tag>)).toContain('dir="auto"');
  });
  it("Avatar is decorative", () => {
    expect(html(<Avatar initials="SM" />)).toContain('aria-hidden="true"');
  });
  it("RouteTabs mark the current page and show counts", () => {
    const out = html(<RouteTabs label="Staff" link={Link} tabs={[{ href: "/a", label: "Staff", count: 3, active: true }, { href: "/b", label: "Pending" }]} />);
    expect(out).toMatch(/<nav aria-label="Staff"/);
    expect(out).toMatch(/<a href="\/a" aria-current="page"/);
    expect(out).not.toMatch(/<a href="\/b" aria-current/);
    expect(out).toContain(">3<");
  });
  it("SettingsSection is a section named by its heading", () => {
    const out = html(<SettingsSections><SettingsSection id="name" title="Your name" description="Shown to colleagues">fields</SettingsSection></SettingsSections>);
    expect(out).toContain('<section aria-labelledby="name"');
    expect(out).toContain('<h2 id="name"');
  });
  it("ListCardItem links its title when it opens something", () => {
    const out = html(<ListCard label="Roles"><ListCardItem title="Finance" href="/roles/1" link={Link} meta="2 people" /></ListCard>);
    expect(out).toContain('<ul aria-label="Roles"');
    expect(out).toContain('<a href="/roles/1"');
    expect(out).toContain("2 people");
  });
});
