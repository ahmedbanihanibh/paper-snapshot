# Linear — document `⋯` options menu

Surface: document view header, the `⋯` button (`aria-label="Document options"`)
Captured 2026-08-28, Chromium via CDP :9222, LIGHT theme, viewport 1432x723.
Rows read by GEOMETRY, not by ARIA role — see the trap below.

## Inventory — 10 rows, 2 separators

| # | label | chord | icon | submenu |
|---|---|---|---|---|
| 1 | Move to | ⇧P | yes | ▶ |
| 2 | Pin to team | — | yes | ▶ |
| 3 | Duplicate | — | yes | — |
| 4 | Rename… | ⇧R | yes | — |
| | *separator* | | | |
| 5 | Unfavorite | ⌥F | yes | — |
| 6 | Copy | — | yes | ▶ |
| 7 | Remind me | ⇧H | yes | ▶ |
| | *separator* | | | |
| 8 | Hide author names | ⇧A | yes | — |
| 9 | Show document history | — | yes | — |
| 10 | Delete | — | yes | — |

Row 5 reads **Unfavorite** because this document is currently favorited — it
is the toggled label, not a fixed one.

`Delete` is rendered in the SAME colour as every other row
(`lch(20 1 282)`), not a destructive red. Worth stating because inventing a
destructive tint the reference does not have is a shipped drift class here.

## Measured chrome

| | value |
|---|---|
| panel | x 660, y 49, w 203, h 356 |
| row height | 32px, all ten |
| row width | 203 — full bleed, `inset: 0` from the panel's left edge |
| row radius | `0px` on the `<li>` — but see THE PLATE below: the rounded plate is a CHILD, and an earlier draft of this file wrongly concluded from this line that the rows are not inset plates |
| row colour | `lch(20 1 282)` for every row including Delete |
| separators | 2 (after Rename…, after Remind me) |

Note the panel itself reports `background: lch(100 0 0 / 0)`, `border: 0px
none`, `box-shadow: none`, `padding: 0px` — the visible card is painted by a
child, so the chrome numbers above are the LIST box, not the surface. Reading
the surface needs `capture_component`'s frame file, which is the documented
chrome oracle.

## The trap this capture exists to record

**Linear's menu PANEL carries `role="menu"`; its ITEMS carry no role at all.**
A `[role="menuitem"]` query returns **0 rows** on this menu — a real menu
reported as EMPTY. Geometry finds all 10: an element inside the panel, 18-44px
tall, at least 60% of the panel width, with one short text run.

This was live in `context-menu-inventory.mjs` when it was committed for #136
and is now fixed there. Had #136's diagram menu been found, the tool would
have written an empty inventory and it would have looked like a finding.


## Submenus — all four, measured

The four ▶ rows, captured by hovering each and reading the panel that opens
to the RIGHT of the parent.

### Move to — 1 row
| label | row h |
|---|---|
| Test 48bd_dd25 | 44 |

Panel 212 x 44 at (862, 49). One row because this workspace has one team; the
row carries the team key as a secondary label and a trailing ✓ for the
current team, so it is a CHECKED-state row, not a plain action.

### Pin to team — 1 row
| label | row h |
|---|---|
| Test 48bd_dd25 | 44 |

Panel 213 x 44 at (862, 81). Same shape as Move to.

### Copy — 4 rows
| label | row h |
|---|---|
| Copy URL | 32 |
| Copy title | 32 |
| Copy title as link | 32 |
| Copy content as Markdown | 32 |

Panel 270 x 140 at (862, 221).

### Remind me — 5 rows
| label | row h |
|---|---|
| An hour from now | 32 |
| Tomorrow | 32 |
| Next week | 32 |
| A month from now | 32 |
| Custom… | 32 |

Panel 317 x 172 at (862, 253).

### Two rules the four together give up

**Submenu placement: `submenu.left = parent.right - 1`.** The parent is
x 660 w 203 (right edge 863) and every submenu opens at x 862. The vertical
origin tracks the invoking row, not the parent's top: Move to 49, Pin to team
81, Copy 221, Remind me 253 — each ≈ the row's own y.

**List padding is 12px total (6 top + 6 bottom)**, derived rather than
assumed: Copy is 4 rows x 32 = 128 in a 140 panel; Remind me is 5 x 32 = 160
in 172. That matches the 6px list padding already encoded in our
`WorkMenuRow` anatomy, so this menu is NOT an exception to it.

Row height is 32 for ACTION rows and 44 for the team rows in Move to / Pin to
team — the taller row is the one carrying a secondary label and a check.
(The Move-to panel reports h 44 for a 44px row, i.e. no padding, unlike the
two action lists. Treat that as unexplained rather than as a second rule:
the measured panel may be an inner wrapper there.)


## The surface — read from the element that actually paints

The panel that carries `role="menu"` is transparent (`lch(100 0 0 / 0)`, no
shadow, no padding). The visible card is a DESCENDANT, found by effect: the
deepest node >100x100 with both a background and a shadow.

| | light | dark |
|---|---|---|
| box | 204 x 357 @ (659, 48) | same |
| background | `lch(100 0 282)` | `lch(12.72 0.85 272)` |
| radius | `12px` | `12px` |
| border | `0.5px solid lch(91.9 0 282)` | `0.5px solid lch(25.68 1.93 272)` |
| padding | `0px` | `0px` |
| backdrop-filter | `none` | `none` |

Shadow, and note it is NOT one token recoloured — the GEOMETRY differs by
theme, so a clone that swaps only the colour is wrong:

- light: `0 6px 18px lch(0 0 0 / .02)`, `0 3px 9px / .04`, `0 1px 1px / .04`
- dark: `0 3px 8px lch(0 0 0 / .125)`, `0 2px 5px / .125`, `0 1px 1px / .125`

Three layers in both, but light is taller and softer (18/9/1 at 2-4% alpha)
while dark is tighter and heavier (8/5/1 at a flat 12.5%).

## THE PLATE — a child, and it matches our primitive exactly

Measured by diffing every descendant's computed paint across a real pointer
hover (dark theme):

| node | box | inset from panel | radius | background |
|---|---|---|---|---|
| `<li>` row | 203 x 32 | 1 | `0px` | stays transparent — only its `color` brightens, `lch(91.178 1.425 272)` → `lch(100 0 272)` |
| plate `<div>` | **191 x 32** | **7** | **`8px`** | transparent → **`lch(20.82 1.3 272)`** |

So the hover wash is an INSET, ROUNDED plate on a child — 191 inside a 203
panel — and the row element itself never paints. Reading the row's own style
finds `radius: 0` and a transparent background and concludes, wrongly, that
this menu has full-bleed rows.

**This is our `WorkMenuRow` anatomy, confirmed a third time**: 6px list
padding, 32h rows, `rounded-[8px]` plates, hover wash. The document menu is
not an exception.

## Chords, with modifiers

The extractor now concatenates every leaf text run after the label, so the
modifier glyph is no longer dropped. Rows also carry an accessible spelling
alongside the glyph ("Shift P" and "⇧P" are separate nodes):

| row | chord |
|---|---|
| Move to | ⇧P (+ ▶) |
| Rename… | ⇧R |
| Unfavorite | ⌥F |
| Remind me | ⇧H (+ ▶) |
| Hide author names | ⇧A |

Duplicate, Copy, Pin to team, Show document history and Delete have none.

## Not measured

- The plate in LIGHT theme. It was diffed in dark only; the light background
  value is unmeasured (the geometry — 191x32, inset 7, radius 8 — is
  theme-independent and was read once).
- ACTIVE/pressed and keyboard-focus row treatment; only pointer hover was
  diffed.
- Submenu row detail beyond labels + heights: icons per row, the ✓ mark's
  own geometry, and the secondary team-key label's type.
- Nothing further on chords or themes: both are now measured above.


---

# Addendum — Linear's POPOVER shares the menu's shadow (board #181)

Captured 2026-08-28 on the documents-list **Display options** popover
(Grouping / Ordering / two toggles / display properties) — a PANEL of
controls, which is the distinction #181 needed: not a list of menu rows.

Found by effect, same as the menu: the deepest node painting both a
background and a shadow.

| | light | dark |
|---|---|---|
| box | 301 x 224 @ (1115, 93) | identical |
| background | `lch(100 0 282)` | `lch(12.72 0.85 272)` |
| **radius** | **`8px`** | **`8px`** |
| border | `0.5px solid lch(91.9 0 282)` | `0.5px solid lch(25.68 1.93 272)` |
| padding | `0px` | `0px` |
| backdrop-filter | `none` | `none` |
| shadow | `0 6px 18px /.02`, `0 3px 9px /.04`, `0 1px 1px /.04` | `0 3px 8px /.125`, `0 2px 5px /.125`, `0 1px 1px /.125` |

**The popover and the menu are the same chrome except for the radius**:
identical background, identical border colour, identical per-theme shadow
stack — popover 8px, menu 12px. So "popover elevation" is not a separate
elevation in Linear; it is the menu's, on a smaller corner.

That settles what our `--popover-shadow` dark should be. It had been the
LIGHT stack "dark-scaled" (18/9/1 at 24-30%), which is wrong in shape as
well as alpha — the reference does not rescale one geometry across themes.
