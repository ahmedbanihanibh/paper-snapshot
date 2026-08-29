# PB dashboard redesign — Paper frame inventory

Paper file: `https://app.paper.design/file/01M0JG34H5ZKFDPTV1J120YDXQ`.

**The 34 PB route frames live on their own page: `3-0` "PB dashboard — review
stack"** (`https://app.paper.design/file/01M0JG34H5ZKFDPTV1J120YDXQ/3-0`, root
`root_node_3-0`). Page `1-0` keeps the raw Linear captures, the superseded
`PB · X · Y` middot-named frames, the Legend and the token board — source
material, not the deliverable.
Every frame is a re-content of a real Linear capture — chrome, icons, radii and
shadows are Linear's own pixels. Nothing here was drawn by hand.

Updated 2026-08-21.

## Canvas layout — the review stack

All route frames sit in one grid on page `3-0` so they can be read side by side:
origin **x = 0, y = 0**, pitch **1532 × 823** (frame 1432×723 + 100px gutters).
**Row A (y = 0) is dark, row B (y = 823) is light**, one column per route, in IA
order: Dashboard → Protocols → Protocols (populated) → Templates → Documents →
Activity → Issues → Inbox → Firmware → Settings → Team → API keys → Billing →
Usage → Permission audit → Integrations → New project.

Keep new frames on this grid; a frame parked anywhere else will not be seen.
Position with `update_styles` `{left, top}` (artboards are `position:absolute`) —
`move_nodes` only reparents/reorders, it does not set coordinates.

## Templates (do not re-content these — duplicate them)

| shape | dark | light |
|---|---|---|
| settings card/row shell (**the admin-family template**) | `XFP-0` | `108T-0` |
| list/table shape | — | `ODH-0` |
| settings, un-scrolled sidebar (Account group at top) | `RQA-0` | `SAI-0` |

`XFP-0` / `108T-0` are the ones to duplicate for a new admin route: their sidebar is
already scrolled to `Administration` and their content is already Protocolbase.

## Route frames

| PB route | dark | light |
|---|---|---|
| `/dashboard` (home) | `NXS-0` | `Q9B-0` |
| `/dashboard/protocols` (1 row) | `T84-0` | `ODH-0` |
| `/dashboard/protocols` (7 rows) | `16RJ-0` | `16AV-0` |
| `/dashboard/templates` | `TM9-0` | `13ZK-0` |
| `/dashboard/documents` | `U0E-0` | `14DE-0` |
| `/dashboard/activity` | `UEJ-0` | `14R8-0` |
| `/dashboard/issues` | `USO-0` | `1552-0` |
| `/dashboard/inbox` | `QP0-0` | `R7N-0` |
| `/dashboard/settings` | `RQA-0` | `SAI-0` |
| `/dashboard/team` (Members) | `XFP-0` | `108T-0` |
| `/dashboard/api-keys` | `Z4D-0` | `10S2-0` |
| `/dashboard/billing` | `V6T-0` | `11BB-0` |
| `/dashboard/usage` | `VR1-0` | `11UK-0` |
| `/dashboard/audit` | `WB9-0` | `12DT-0` |
| `/dashboard/integrations` | `WVH-0` | `12X2-0` |
| `/dashboard/import` (New project) | `ZOL-0` | `13GB-0` |
| `/dashboard/firmware` | `15WQ-0` | `15IW-0` |

## Route → settings-nav row it highlights

The Linear settings nav's `Administration` group maps almost 1:1 onto PB's admin
routes, which is why every admin frame uses that group and the same scroll offset:

| PB route | nav row |
|---|---|
| `/team` | Members |
| `/api-keys` | API |
| `/billing` | Billing |
| `/usage` | Usage & limits |
| `/audit` | Security |
| `/import` | Import & export |
| `/integrations` | Integrations (in the **Features** group, not Administration) |

## Content source

Every string comes from the shipped route code, recorded in
`pb-dashboard-route-functionality.md`. The recipe, the traps, and the measured
selected/rest row values are in `capture-to-paper-workflow.md`.

## The sidebar in list-shape frames is a known compromise

Every list-shape frame (Protocols / Templates / Documents / Activity / Issues /
Firmware) keeps Linear's captured app sidebar verbatim, with the project-scoped
**Overview** row highlighted — even on org-level routes where that is not the row
the user is on. Moving the highlight would mean a nav row that does not exist in
the capture, and inventing one means **drawing an icon**, which the standing rule
forbids. The correct fix is to capture Linear with the matching nav expanded (the
`Library` group holds the Templates/Documents equivalents) and re-import, not to
author the row. Recorded so the wrong-looking highlight is not mistaken for a slip.

## Source captures on the review page (row y = 1746, prefix `SRC`)

Captured 2026-08-22 from live Linear, dark. These are **Linear pixels, not PB
frames** — they sit in their own row under the grid until they are re-contented.

| node | surface | why it matters |
|---|---|---|
| `178I-0` | team overview **populated** | the empty-state gap in `NXS-0`/`Q9B-0` — now closable |
| `17P5-0` | section ⋯ menu + "Section created" **toast** | first toast anatomy in the file |
| `186R-0` | Slack notifications **modal** | master toggle gating six disabled rows = `MasterToggleSection` |
| `18EH-0` | document detail body | reading/editing surface; PB has none |
| `188E-0` | Add-resources **dropdown** | the "Add New…" menu anatomy |
| `189U-0` | document ⋯ menu | submenu rows + **keyboard-shortcut chips** |
| `18EY-0` | workspace switcher menu | — |

**Measured dropdown chrome (dark)** — identical on both menus, so it is the
primitive, not a one-off:

```
container   radius 12px
            background lch(12.72 0.85 272)
            border     0.5px solid lch(25.68 1.93 272)
            shadow     lch(0 0 0 / 0.125) 0 3px 8px 0,
                       lch(0 0 0 / 0.125) 0 2px 5px 0,
                       lch(0 0 0 / 0.125) 0 1px 1px 0
row         height 32px, font 13px / 19.5px 400 "Inter Variable"
            colour lch(91.178 1.425 272)
```

**Correction (2026-08-22)**: the selection hook is **`data-focused="true"`**, not
`aria-selected` — every row reports `aria-selected="false"`, including the
highlighted one. The full row/menu anatomy, the two-level shadow ladder, the
inset-child highlight, the separator rule and the three submenu shapes are now
measured in **`row-context-menu.md`**. The three-layer shadow quoted above is
depth 1 (a flat menu); submenus carry a five-layer depth-2 stack.

## Context-menu row (y = 2569, prefix `SRC`)

Captured 2026-08-22 from live Linear, dark. Spec: `row-context-menu.md`.

| node | surface |
|---|---|
| `18H4-0` | document row `⋯` menu — 4 groups, icon column, shortcut chips, `▶` rows |
| `18LR-0` | submenu **A** — searchable entity picker (`Move to`) |
| `18NY-0` | submenu **B** — plain rows + multi-glyph shortcuts (`Copy`) |
| `18QD-0` | submenu **C** — presets showing their resolved value (`Remind me`) |

## Retired-product vocabulary that is deliberately kept

The API-keys frames read "Builds: create & cancel", "Builds: read",
"Sessions: read". Those are the **shipped strings** in `ApiKeysContent` — leftovers
from the retired Code product that still live in the app. They stay in the frames
because the brief is to show the app's real functionality; changing them is a code
change, not a design change. Flagged so the next reviewer does not "fix" the mockup
and quietly desync it from the product.

## Not done

- The **members table body** the Paper importer drops (`022` capture) is still
  unrebuilt — the Team frames use the settings card/row anatomy instead, which is
  a deliberate substitution, not the real table.
- No frames for `/documentation`, `/system`, `/admin/*`, `/billing/plans`,
  `/settings/preferences`.
- No hover / focus / open-menu states for any PB frame — only the rest state.
- Nothing here has been checked against the running app at 1432×723; the frames
  are Linear's geometry with PB content, not a diff against PB's current build.
