# Design References

**Status:** Non-binding visual reference (Constitution §X). Use it only for the color palette and the general shell idea. Do not copy it pixel-for-pixel, and do not infer screens, fields, workflows, authentication or security rules from it (FR-040).

| File | What it shows |
| --- | --- |
| `erak-portal-chatgpt-dark-no-workspace.html` | Self-contained HTML prototype: sign-in screen plus an empty application shell, Dark and Light themes, Arabic RTL and English LTR |

The ERAK (إراك) name and logo inside the prototype are a **sample tenant identity**. In the product they come from each tenant's configuration (FR-035, FR-036). They are never a default or fallback for other tenants (Constitution IX).

## Owner decisions (2026-10-15)

- The fixed platform palette starts from this reference, with the contrast fixes below.
- The accent intentionally differs per theme: green in Dark, teal in Light.
- Typography: **Cairo** for Arabic and **Inter** for English/Latin, both loaded with `next/font/google` so they are self-hosted at build time.

## Adopted

### Palette

These are the fixed platform tokens for every tenant. They are not tenant-configurable, so the prototype's comment "tenant accent stays configurable" is **not** adopted (FR-037).

| Token | Dark | Light |
| --- | --- | --- |
| `--bg` | `#212121` | `#f1f6f7` |
| `--card` | `#2f2f2f` | `#ffffff` |
| `--sidebar` | `#171717` | `#ffffff` |
| `--secondary-bg` | `#1f1f1f` | `#f8fbfc` |
| `--line` (decorative borders, dividers) | `#414141` | `#d5e3e7` |
| `--divider` | `#333333` | `#e4eef0` |
| `--text` | `#f2f2f2` | `#183545` |
| `--muted` | `#bdbdbd` | `#506b7a` |
| `--subtle` | `#a1a1a1` | **`#5c7480`** (was `#647e8b`) |
| `--accent` | `#68b78b` | `#087e89` |
| `--accent-strong` | `#b2e3c7` | `#076a75` |
| `--accent-soft` | `rgba(104,183,139,.12)` | `rgba(0,143,153,.09)` |
| `--hover` | `rgba(255,255,255,.065)` | `rgba(9,94,120,.055)` |
| `--on-accent` (text on accent buttons) | `#11262c` | **`#ffffff`** (was `#11262c`) |
| `--input-border` (new: form-control borders) | **`#787878`** | **`#6196a5`** |

### Contrast fixes (WCAG 2.2 AA)

The prototype's Dark theme passes every check. Four values failed and were adjusted while keeping their hue:

| Pair | Prototype | Adjusted | Required |
| --- | --- | --- | --- |
| Light `--subtle` text on `--bg` / `--card` | 3.93 / 4.29 | ≥ 4.5 with `#5c7480` | 4.5 |
| Light button text on `--accent` | 3.26 | 4.82 with `#ffffff` | 4.5 |
| Dark input border on input/card background | 1.58 | ≥ 3.0 with `#787878` | 3.0 (non-text UI) |
| Light input border on input/card background | 1.31 | ≥ 3.0 with `#6196a5` | 3.0 (non-text UI) |

`--line` stays low-contrast because it is only decorative. Every form control uses `--input-border`. `scripts/check-contrast.mjs` (T165) re-verifies all pairs in CI.

### Shell idea

Owner decisions (2026-10-16), implemented in `packages/ui/src/components/app-shell.tsx`:

- A full-width top bar: the sidebar collapse toggle and the tenant identity (a link home) at the start, the account menu at the end. The account menu holds the person's own pages and sign-out only.
- A primary sidebar in two groups (main menu, system administration) that collapses to icons, with the label as a tooltip; the choice is remembered in the `sidebar` cookie. Below `lg` it is always icons only.
- An optional secondary sidebar for the current section only (Constitution §X): Settings, and the account pages (profile, appearance and language, password, sessions). The workspace uses the full width otherwise.
- Language and theme are chosen on the Appearance and language page (`/account/appearance` in the portal, `/appearance` in the admin app), not in the top bar.
- An off-canvas drawer on phones, in which a section opens as a drill-down panel with a way back to the main menu.
- Logical CSS properties for RTL/LTR, `prefers-reduced-motion` and `prefers-contrast: more` support.
- A sign-in card with the tenant logo (or the neutral icon) above a minimal form, with no marketing copy. The tenant name is the page title, not text in the card (owner change, PR #23).

### Page layout

Owner decisions (2026-10-16), implemented with the page kit in `packages/ui/src/components/` (tasks T209–T211):

- Every page starts with a page header: the breadcrumb, the title and a short description, with the page's primary action at the end of the title row.
- Lists and tables are wide and sit in a card; on phones each table row becomes a small card.
- Forms and settings are narrow, in a card, in two columns: what a group is and why on one side, its fields on the other.
- Search, filters and sorting appear only where the list needs them (staff, audit, security logs, tenants), never on short lists such as roles or invitations. They are URL parameters, so a filtered list can be bookmarked and shared.
- Related lists that are separate pages (staff and pending invitations, active and archived roles) are route tabs with counts.
- An empty list says what to do next: an empty state with the page's primary action, or a way to clear the filters.

## Not adopted

These conflict with the constitution or the approved spec:

- **Business modules in the navigation** (dashboard, beneficiaries, donors, volunteers, donations, accounts, reports, services). These are out of Core Foundation scope (SC-010). The foundation navigation is defined in T161.
- **Demo sign-in** with hard-coded credentials and the "preview credentials" box. Mock authentication must never ship (Constitution III).
- **Username-only sign-in.** The portal accepts username **or** email (FR-012).
- **Theme defaulting to Dark with only a Dark/Light toggle stored in `localStorage`.** The default is Light, the choices are Dark/Light/System, and the choice persists per user (FR-039).
- **ERAK name or logo as fixed markup.** Tenant identity is rendered from tenant configuration with a neutral fallback icon (FR-035).
- **Tahoma / Segoe UI font stack.** It is replaced by Cairo and Inter.
