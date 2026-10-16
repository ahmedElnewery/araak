import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("")).toBe('""');
  });
  it("neutralises spreadsheet formulas", () => {
    for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) expect(csvCell(v)).toBe(`"'${v}"`);
    expect(csvCell("a=1")).toBe('"a=1"');
  });
  it("starts with a BOM and ends every row with CRLF", () => {
    expect(toCsv([["h1", "h2"], ["إجراء", "x"]])).toBe('﻿"h1","h2"\r\n"إجراء","x"\r\n');
  });
});
