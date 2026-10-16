import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("slots onto a single child", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/settings/roles/new">New</a>
      </Button>,
    );
    expect(html.startsWith("<a ")).toBe(true);
    expect(html).toContain('href="/settings/roles/new"');
    expect(html).toContain(">New</a>");
  });

  it("shows a spinner while a real button is loading", () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(html.startsWith("<button ")).toBe(true);
    expect(html).toContain("animate-spin");
    expect(html).toContain("Save");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });
});
