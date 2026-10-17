# DON-050 — Historical donation extraction (amendment)

Status: updated per owner direction on 2026-10-17. This document amends the donor consolidation baseline.

Historical monthly columns in the donor workbook `إستمارات ثابتة` must be parsed as **historical collection records**, not discarded as mere flags. Retain source workbook, worksheet, row, column/month, original cell text, linked donor and category.

- If a cell explicitly states a monetary amount (e.g. `تم 50`), capture it as a **source-stated historical amount**, not automatically an official receipt.
- If a cell contains only `تم`, infer a **provisional estimate** from the applicable usual donation amount where defensible, mark `amount_basis=inferred`, and preserve the inference basis. Do not present estimates as verified donations.
- Unclear, blank, conflicting, or changed-amount cells must be flagged for manual review, never silently converted to revenue.
- Present source-stated, inferred, and manually verified amounts distinctly. Show unconfirmed estimates separately from confirmed financial totals.
- Do not create official receipt numbers, financial receipts, or retroactive reminders from imported markers automatically. A subsequent explicit, permissioned, audited verification/migration process is required before any amount contributes to confirmed financial totals.
- Merge duplicate donor rows by normalized contact number only with preview and conflict review; preserve distinct source categories/commitments.
- Tests: explicit amount parsing, `تم` inference, unknown amount, duplicate source rows, changed usual amount, confirmed totals exclusion, source provenance, approval audit and idempotent reimport.

Other decisions DON-001–DON-054 remain unchanged; DON-048 remains proposed, not approved.
