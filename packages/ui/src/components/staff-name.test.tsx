import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaffName, staffName } from "./staff-name";

describe("staff names", () => {
  it("joins the first and last name, or falls back to the username while there is none", () => {
    expect(staffName({ firstName: "أحمد", lastName: "علي", username: "Ahmed" })).toBe("أحمد علي");
    expect(staffName({ firstName: null, lastName: null, username: "Ahmed" })).toBe("Ahmed");
    expect(staffName({ username: "Ahmed" })).toBe("Ahmed");
  });
  it("isolates a name with automatic direction and keeps a username left-to-right", () => {
    expect(
      renderToStaticMarkup(
        <StaffName staff={{ firstName: "أحمد", lastName: "علي", username: "Ahmed" }} />,
      ),
    ).toBe('<bdi dir="auto">أحمد علي</bdi>');
    expect(
      renderToStaticMarkup(
        <StaffName staff={{ firstName: null, lastName: null, username: "Ahmed" }} />,
      ),
    ).toBe('<bdi dir="ltr">Ahmed</bdi>');
  });
});
