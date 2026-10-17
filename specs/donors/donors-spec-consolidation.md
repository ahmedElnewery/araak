# Erak — Donors Module | Spec Consolidation Baseline

**Status:** Ready to draft the formal Spec Kit specification after reviewing the documented assumptions below.

**Basis:** Decisions DON-001–DON-054 in this project conversation, especially the explicitly confirmed DON-034–DON-047 and DON-049–DON-054; the donor workbook's main worksheet `إستمارات ثابتة`. This is a consolidation baseline, **not** a claim that any code or GitHub spec was updated.

## Decision status

- **Approved:** DON-049: merge duplicate import rows under one donor, review conflicts before applying.
- **Approved:** DON-050: preserve historical spreadsheet collection markers as history, never manufacture receipts from incomplete financial data.
- **Approved:** DON-051: existing donors found during import are presented for review; approved basic-data updates do not replace historical donations.
- **Approved:** DON-052: support people and organizations, with a required contact number.
- **Approved:** DON-053: EGP only, for now.
- **Approved:** DON-054: record receipts in the application; PDF/download/printing is out of scope for this phase.
- **Pending explicit approval:** DON-048: allow a past callback datetime and display any still-open callback reminder as overdue. Proposed behavior; not counted as approved.

## Scope and tenant model

- Donor data is tenant-owned; enforce tenant isolation, backend authorization and RLS for all donor, receipt, follow-up, and reminder resources.
- Donor records are **not** stored in a shared `Person` entity with beneficiaries/volunteers.
- Platform-level administrators have no routine permission to inspect charity donor data.
- No attribution field equivalent to the worksheet column `من خلال`. Ordinary immutable `created_by`/audit references are separate.
- Tenant-specific branding and configurable lookup values as needed.

## Donor identity and contact

- Required donor display name (a person's name or organization's name), one required primary mobile/contact number.
- Optional address and notes.
- One primary phone and up to three additional phones, **maximum four total**.
- Each phone has an independent WhatsApp flag. Multiple WhatsApp numbers are permitted; none needs to be the primary number. WhatsApp communication is manual, not automatic.
- Every normalized phone number must be unique across donor records within the same tenant, including supplementary phones. Reuse by different tenants is allowed.
- Changes to names, phone numbers, WhatsApp flags, and other donor data are audited.
- Donor can be an individual or an organization; use the same base required fields in this phase.
- **Proposed implementation detail:** normalize both local Egyptian and valid international numbers, without assuming that every source number begins with `01`. Safeguard unparseable numbers during imports by review instead of silent loss.

## Monthly and variable donors

- Donor classification: `شهري` (monthly) or `متغير` (irregular / ad hoc), separate from configurable donation categories.
- Monthly donor has an indicative usual amount, a scheduled day of month (1–31), and optional informational donation purpose/category fields as applicable. The usual amount is not a debt and actual receipts can be of any amount.
- If the scheduled day does not exist in a particular month, use that month's last calendar day without changing the configured day.
- Monthly donors may have no receipt in a month; no overdue financial amount or accounts receivable is created.
- Employee-authorized type conversion between monthly and variable applies at the start of the **next** month, preserving receipt and communication history.
- Recurring day changes also take effect next month. Usual amount adjustments are informational and audited.
- No temporary pause setting. A month's reminder may be closed following refusal, without preventing the following month's schedule.
- **Import consistency guard:** importing duplicate spreadsheet rows must not silently sum, replace, or erase distinct schedules/purposes. Flag conflicting monthly commitments for manual resolution. This guard does not itself approve multiple simultaneous independent monthly schedules; that is a separate product choice if real data requires it.

## Reminders

- Reminders are internal to employees. Never auto-send donor messages.
- Tenant manager configures monthly reminder lead time from 0–30 calendar days; change applies starting next donation month, and is audited.
- Any employee with `donors.view` can view reminders within their allowed donor scope; actionable permissions for adding/editing follow-ups are independent.
- Monthly reminders are follow-up prompts, **never financial debt**. Past-due open reminders are displayed as `متأخر متابعة`.
- No stacking of monthly reminders: while an earlier monthly reminder is open, do not create/show a new monthly reminder for following months. If an earlier reminder is closed in a later month, skip that entire later month's monthly reminder and resume next month. Callback reminders are independent.
- A staff member can close a reminder after a communication or without one; closure without recorded communication requires a reason. All actions are audited.
- A valid receipt in a month's monthly cycle automatically closes that month's open monthly reminder, irrespective of amount and number of receipts. Callback reminders are unaffected.
- Receipt date correction/cancellation that changes which valid receipts exist for a cycle must preserve/remind of manual reopen-or-stay-closed decision; other valid receipts in the month keep the monthly reminder closed.

## Communication history

- One chronological communication log combining telephone calls and WhatsApp outreach.
- Each entry contains channel (`phone`/`whatsapp`), the **specific stored phone number** used, result, actual event datetime, immutable system creation datetime, employee actor, optional notes, and status.
- Log the historical phone-number value at the time of the contact so subsequent profile updates do not rewrite history.
- Communication outcome options start with `تم التواصل`, `لم يرد`, `اعتذر عن التبرع`, `طلب إعادة الاتصال`; tenant managers may add/rename/deactivate options, retaining historical meaning.
- `donors.followups.create` is separate from `donors.view`; actor must also have access to the donor.
- Employee with `donors.followups.update` may edit their own communications; managers or specifically delegated actors with broader update authority may edit others' communications within scope.
- Cancellations likewise: an authorized employee may cancel their own entry; appropriately delegated managers/staff may cancel others. Mandatory cancellation reason; soft cancellation and full audit; canceled events excluded from active communication reporting.
- Backdated actual communication datetime is allowed, while real creation timestamp remains immutable. Historic communications can be linked to currently open reminders; staff chooses whether to close them, and closing records the real system time.
- Outcome `طلب إعادة الاتصال` requires callback date/time and creates a linked internal callback reminder. Modifying an open reminder's callback datetime updates the existing reminder with audit, not a duplicate.
- Canceling the originating communication or changing its callback-request outcome to another outcome automatically cancels any **open** linked callback reminder, retaining history. Closed callback reminders are never retroactively erased or reclassified.
- Changing a saved communication from another outcome to `طلب إعادة الاتصال` requires callback datetime and creates a linked callback reminder, without two simultaneously active reminders from the same communication.
- **DON-048 pending:** allow callback dates in the past and mark any open reminder overdue.

## Financial receipts and donations

- Actual donation receipts may be from monthly or variable donors; any amount, any number per month for a monthly donor.
- One receipt can allocate amounts to several configurable donation categories; allocated category amounts must sum precisely to receipt total.
- Tenant-configurable donation categories and collection methods; initial payment methods `فوري`, `إنستا باي`, `كاش`; historical receipts retain previous values after option deactivation/rename.
- Each receipt has an automatically generated, immutable, unique digital receipt number **per tenant**; the number is never reused even if the receipt is canceled.
- Optional paper receipt number; when supplied it is unique per tenant and remains reserved after cancellation.
- Receipt has employee-selected effective donation date and separate immutable system `created_at` and `created_by`. Group financial reports by **effective donation date**.
- Corrections to valid receipts are allowed with appropriate permissions and complete before/after audit; digital receipt number is immutable.
- Cancel receipts logically instead of deleting them; cancelled receipts contribute zero to active donation totals and cannot have financial fields edited after cancellation.
- **DON-053:** currency EGP only for phase one.
- **DON-054:** PDF, receipt download and printing are out of scope for phase one; recorded receipts remain in-app.

## Excel migration/import

- Primary source worksheet `إستمارات ثابتة`; do not migrate/remove context from other sheets unless explicitly separately scoped.
- Known source concepts: donor name, telephone, address, donation amount/type, notes, collection method, collection day, reminder date, collection start, amount increases, communication result and historical monthly columns. **Drop the `من خلال` field entirely**.
- Before commit, preview the import: new donors, matched donors, proposed contact/basic-data changes, invalid numbers, conflicts and historical rows.
- Dedupe by normalized phone within tenant; use linked receipt/category/commitment information where defensible, but **do not guess** if name, organization/individual type, number owner, schedules or commitments conflict.
- Existing donor matches: review and explicitly approve any basic-data update; do not overwrite receipts or communications with spreadsheet values.
- Historic monthly columns are retained separately as imported historical collection markers, without creating financial receipts, revenue totals or backdated reminders.
- Consider the four-phone maximum when merging rows; excess distinct contacts are a review exception rather than silent truncation.

## RBAC and non-functional rules to spell out in final Spec

- Tenant scope and role-check on **every** backend operation; front-end visibility is not sufficient.
- Separate role actions for donors read/write, communications create/update/cancel, reminders view/action, receipts create/correct/cancel, imports review/apply, categories/methods settings and reporting.
- Auditable records for donor updates, receipt corrections/cancellations, reminder closes/reschedules/reopens, communication changes, imports and tenant-setting changes.
- Concurrency-safe uniqueness for donor phones and receipt numbers, at database level and tenant-scope.
- Explicit workflow handling for import conflict approval, receipt cancellation and reminders, and communication-linked reminder consistency.

## Core acceptance tests for Spec Kit

1. Two tenants may use the same normalized phone; one tenant cannot assign it to two different donors, even via an additional number or concurrent import.
2. One donor may have four phone numbers; multiple WhatsApp flags are allowed; a fifth number is rejected.
3. A monthly donor with no valid receipt in a month has no monetary debt; the follow-up reminder is not equivalent to an overdue balance.
4. Multiple receipts for the same month sum correctly; a first valid receipt closes the monthly reminder irrespective of receipt amount.
5. An imported historical monthly completion marker cannot create a financial receipt or alter revenue totals.
6. Canceling a valid financial receipt excludes it from totals but never releases its paper/digital receipt numbers.
7. Updating a communication's callback datetime updates exactly one open callback reminder, while preserving its previous datetime in audit.
8. Canceling a communication cancels only its own **open** callback reminder, not unrelated monthly reminders.
9. Backdated communication datetime does not backdate audit/creation/actual reminder closure timestamp.
10. Imported duplicates with conflicting donor names/organization type/schedules remain in a review state until explicitly resolved.

## Final Spec Kit document outline

1. Objective / User scenarios
2. Actors, tenant boundaries and permissions
3. Donor contact profile and classification
4. Monthly scheduling and reminders
5. Communication timeline and callback reminders
6. Donations and receipt lifecycle
7. Lookup/settings customization
8. Excel import and historical data
9. Reporting and filters
10. Audit, security and invariants
11. Edge cases, acceptance scenarios and requirements checklist

## Final review notes

- No fundamental architectural contradiction in the confirmed decisions.
- The only explicitly unconfirmed decision is DON-048.
- Most important unresolved business-model question: whether real-life monthly donors may hold **more than one independent simultaneous monthly commitment**. The current safe interim specification is one donor profile and manual review for incompatible source schedules, **not silent loss of commitments**.
- Organization contact requirement currently interpreted as a required mobile/contact phone under the same uniqueness rules; adding separate landline fields is not yet approved.
- Standard report outputs and permission names should be enumerated in the formal Spec, using existing reporting/audit rules without inventing donor financial liabilities.

## DON-055 — Canonical import format and invalid dates (approved 2026-10-17)

- Canonical import date: `YYYY-MM-DD`; datetime: `YYYY-MM-DD HH:mm` (24-hour, tenant timezone).
- Reject ambiguous/unreliable dates as dates; do not guess, autocorrect, or replace with today's date. Display/export `N/A`; persist SQL `NULL` in typed date/datetime fields and preserve raw source text for review.
- Invalid dates alone do not reject the entire donor record; surface them in import preview and import quality report. Never schedule reminders from unknown dates.
- Currency is EGP. Canonical amounts use decimal with two fractional digits; malformed/missing amount is unknown, not zero.
- Historical month markers may be imported as historical collection records with source cell, original marker, donor link, category when reliable, month/date only if reliable, and amount provenance: `explicit`, `estimated_from_typical`, or `unknown`. An explicit source amount is not automatically a verified financial receipt. Estimates never count toward confirmed financial totals until independently verified through a controlled approval workflow. No fabricated receipt numbers or retroactive reminders.
- Existing DON-050 prohibition on creating actual financial receipts from incomplete historical records remains in force. Historical estimates and amounts are separate from posted donation receipts.
- Validate and preview before applying; never silently drop source rows due solely to invalid dates. Preserve original input for traceability.