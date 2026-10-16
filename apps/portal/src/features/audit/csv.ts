// CSV for spreadsheet tools: UTF-8 with a byte-order mark (Arabic opens correctly), CRLF rows, every cell quoted.
// A cell that a spreadsheet would run as a formula (=, +, -, @, tab, CR) is prefixed with an apostrophe.
const FORMULA = /^[=+\-@\t\r]/;
const BOM = "\uFEFF";

export function csvCell(value: string): string {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${BOM}${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
