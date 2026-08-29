# Linear — tooltip + shortcut chip

Captured 2026-08-24, light, team Documents list (`/tmp/tip3.mjs` — `Create new
document`; `/tmp/tip6.mjs` — `Select document · X`, reached by hovering a doc
row then its revealed checkbox at row-x+18).

## Plate

| | value |
|---|---|
| box | content-sized — 132×28 (label only), 131×28 (label + one chip) |
| radius | 8 |
| ground | `lch(100 0 282)` = `--menu-bg` |
| border | `0.5px solid lch(91.9 0 282)` (#E8E8E8 = `--menu-border` light) |
| shadow | `lch(0 0 0/.02) 0 3px 6px -2px, lch(0 0 0/.04) 0 1px 1px 0` — the same two-stop stack as the link popover and the resolved card |
| inner row | `flex` · `align-items center` · **`gap 8`** · **`padding 5px 8px`** |
| label | **11px / 450**, `lch(20 1 282)` (#303032) |

## The shortcut chip

A real `<kbd>`:

| | value |
|---|---|
| box | 18×17 (single key) |
| radius | **4** |
| padding | 2 |
| border | `0.5px solid lch(91.9 0 282)` |
| ground | transparent |
| type | 11px / 400, `lch(40 1 282)` (#5E5E60) — DIMMER than the label |

Chips sit in a `flex gap-3px` span (multi-key chords get one kbd per key).
A 1×1 clipped span duplicates the key text for a11y.

## Delay

`Create new document` appeared within the 1.5s hover of the probe; the earlier
`role=tooltip` sweep at 3s found nothing because **Linear's tooltip has no
`role=tooltip`** — it is a plain positioned div. (Probe lesson: matching by
role was an absence-probe.)

## Not measured

- Dark theme.
- Exact dwell delay and the group-delay behaviour (instant re-show when moving
  between neighbours) — observed in past sessions, not timed here.
- Side/align/offset per placement.
- A chord chip with modifiers (⌘⇧X) — glyph-per-kbd vs one kbd.
- Max width / wrapping behaviour on long labels.
