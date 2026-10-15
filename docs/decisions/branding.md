# Decision: Branding, palette, fonts and logo policy

**Status: PENDING OWNER APPROVAL** (⛔ GATE-BRAND, final values). Starts from the non-binding `docs/design-references/README.md`; owner decisions of 2026-10-15 are already recorded there.
**Traces to:** FR-035–FR-037, Constitution IX.

## 1. Fixed platform palette (not tenant-configurable)

Light under `:root`, dark under `.dark`. Values are exactly the table in `docs/design-references/README.md` ("Palette"), including:
- `--on-accent` (text on accent buttons): dark `#11262c`, light `#ffffff`
- `--input-border` (form controls): dark `#787878`, light `#6196a5`
- Focus tokens: a 2px ring using `--accent-strong`, offset 2px, on every interactive element; never removed without a replacement.
- The accent is per theme by owner decision: green (`#68b78b`) in Dark, teal (`#087e89`) in Light.

All text/background and non-text UI pairs must meet WCAG 2.2 AA (4.5:1 text, 3:1 UI components and focus indicators). `scripts/check-contrast.mjs` (T165) re-verifies them in CI. Tenants cannot override any color (FR-037).

## 2. Fonts (owner decision 2026-10-15)
Cairo for Arabic, Inter for English/Latin, via `next/font/google` (self-hosted at build time), exposed as `--font-arabic` and `--font-latin`. Arabic text lists Cairo first, Latin text Inter first.

## 3. Organization display name
Required. After `btrim`, 1–80 characters, Unicode letters, digits, spaces and common punctuation (`. , - ' & ( )`). No control characters, no markup. Rendered as text only, never as HTML. Shown with `dir="auto"`.

## 4. Logo
- Optional. Allowed MIME types (checked by content sniffing, not only the extension): `image/png`, `image/jpeg`, `image/webp`. **SVG is excluded** (script/XSS risk).
- Maximum 1 MiB, maximum 1024×1024 px, minimum 64×64 px.
- Re-encoded server-side to strip metadata before storage.
- Stored in the private bucket `tenant-logos`, path `<tenant_id>/<version>.<ext>`; writable only by server-side service-role code.
- Delivered through a portal route (never a public bucket URL) with `Cache-Control` keyed on `logo_version`, `X-Content-Type-Options: nosniff`, and tenant resolved from the host (a tenant can never fetch another tenant's logo).
- No logo → neutral accessible icon. No provider name, logo or "Powered by" anywhere in tenant-facing UI or email (Constitution IX).

## Approval

| | |
| --- | --- |
| Owner decision | ☐ Approved ☐ Changes requested |
| Date / name | |
