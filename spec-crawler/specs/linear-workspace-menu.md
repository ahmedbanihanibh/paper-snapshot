# Linear — workspace menu + switch-workspace submenu (top-left trigger)

Captured 2026-08-24 over the spec-crawler MCP on
`linear.app/test-2-org-ahead/team/TES/all` (light). Frames:
`spec-bundle/frames/029-my-workspace-workspace-menu.html` (menu + submenu
chrome oracle), 060 (trigger anatomy). Task #74.

## Trigger (measured, capture_at 060)

- 128×28 @12,16, radius **10px**, transparent ground, text
  lch(18.888 1.25 282), 13.33px Inter 400. `aria-expanded` state attr.
- Anatomy: workspace avatar chip + name + chevron.

## Menu (dialog>listbox, 225×197 @12,48 — opens BELOW the trigger)

Control inventory (5 rows, 32h each, separator groups per y-gaps):

| # | row | chord | kind |
|---|---|---|---|
| 1 | Settings | `G then S` | `<a>` → /{ws}/settings |
| 2 | Invite and manage members | | `<a>` → members settings |
| — | separator (y-gap 87→131) | | |
| 3 | Download desktop app | | `<li>` |
| — | separator (131→175) | | |
| 4 | Switch workspace | `O then W` | `<li>` ▸ hover submenu |
| — | separator (175→207) | | |
| 5 | Log out | ⌥⇧Q | `<li>` |

## Switch-workspace submenu (dialog>listbox 210×227 @235,144 — right of
## the Switch row, opens on hover)

- Header: the ACCOUNT EMAIL (`testdma35@gmail.com`), non-interactive.
- Workspace rows (32h): avatar chip (2-letter monogram) + name + ordinal
  digit chip: `MW My Workspace ¹` / `TE test-2-org-ahead ²` (current) /
  `TE test 48bd_dd25 ³`.
- `Account` group label, then: `Create or join a workspace…` /
  `Add an account…`.

## Our build mapping (named decisions)

- Settings → `/{org}/settings` (until #75 ships the full suite at
  Linear-shaped /settings routes). Invite and manage members →
  `/{org}/team`. Log out → `/api/auth/signout` (out-of-shell assign).
- Switch workspace rows = the user's orgs from the org context; ordinal
  digit chips rendered; selecting routes to that org's root.
- FEATURE-GATED (dead-affordance rule — we have no desktop app, no
  multi-account auth): `Download desktop app`, `Add an account…`.
  Omission mirrors the ctx-menu precedent (Open in / Cycle).
- `Create or join a workspace…` → our org-create flow.

## RESULTS (2026-08-24 — built + driven on localhost)

`components/dashboard/linear-workspace/workspace-menu.tsx` updated and
verified over CDP (captures 062–064): rows carry NO leading icons
(dropped the invented lucide glyphs per frame 029), Settings shows
`G then S`, switch-workspace submenu shows email header + tile + name +
current-check + ordinal digit chips and opens right of its anchor, Log
out prints `⌥ ⇧ Q` and the chord is bound via the object-form registry
entry (`DASHBOARD_GLOBAL.LOG_OUT`). NAMED: the ⌥⇧Q press was NOT driven
— firing it signs the drive session out; binding verified by code path
shared with the driven `?` help chord. NAMED DIVERGENCE: `O then W`
opens the menu root (user hovers into the submenu); Linear may open the
submenu directly — not measured. Create-or-join routes to /pricing (our
real workspace-create path); Join = invitation flow on /team.

## Not measured

- The digit chips' actual key binding (ordinal display captured; whether
  a bare digit switches while the submenu is open not driven).
- Dark theme of THIS menu specifically (chrome = same measured tokens as
  frame 043 family; our build rides MENU_CONTENT_BASE).
- `Add an account…` flow beyond the row (multi-account out of scope).
- Hover/active states of the trigger beyond aria-expanded.
