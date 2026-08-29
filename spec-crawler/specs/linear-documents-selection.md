# Linear — documents table: row selection + bulk bar

Captured 2026-08-24, light, `test-workspace-bb/team/EMP/documents`
(`/tmp/sel1.mjs`–`/tmp/sel4.mjs`; glyphs in full at `/tmp/sel-glyphs.json`).
Owner screenshots (dark) corroborate: checkbox revealed on row hover, selected
rows tinted, bar reading "2 selected · ⌘ Actions · ▷ · ✕".

## Row + checkbox

- Row: 1203×48; hover ground `lch(97.94 0.5 282)`.
- The real `<input type=checkbox>` is 12×12 at `opacity: 0`; the VISIBLE
  chrome is a sibling div at the same spot:

| state | box | radius | border | fill |
|---|---|---|---|---|
| rest | 14×14 | 3 | `1px solid lch(52.04 0 282)` | transparent |
| checkbox hover | 14×14 | 3 | `1px solid lch(47 50.26 286.91)` (blue) | transparent |
| checked | 14×14 | 3 | same blue border | **`lch(53 52.26 286.91)`** |

- Checked check: white (`lch(100 5 286.91)`) svg 10×9 inside — full path in
  `/tmp/sel-glyphs.json::check` (`viewBox 0 0 8 8`-ish, see file).
- Checkbox column x = row.x + 21 (input at 243 for row at 221).
- **Reveal**: in the light capture the 14×14 chrome read `opacity: 1` even
  with the pointer parked; the owner's dark screenshot clearly shows the
  checkbox ABSENT on unhovered rows. The reveal therefore lives on an
  ancestor not probed here — treat "hidden until row hover OR any selection
  active" (the screenshot's behaviour) as the spec, and re-probe the ancestor
  chain before arguing. Tooltip on hover: `Select document · X` chip
  (`specs/linear-tooltip.md`).

## The floating bulk bar

Appears once ≥1 row is selected, floating bottom-centre:

```
pill  254×44 (1 selected) @ y 627 · radius FULL · bg lch(100 0 282)
      · shadow lch(0 0 0/.02) 0 6px 18px, lch(0 0 0/.04) 0 3px 9px,
               lch(0 0 0/.04) 0 1px 1px      (= light --menu-shadow)
      · padding 8 · gap 8 · flex row
├ count  "N selected" — span 12px/400, padding 0 2px 0 12px
├ button "⌘ Actions"  84×28 · radius full · bg lch(100 0 282) · 12px/500
│        glyph 14×14 (⌘, full path saved) + label · aria "Open command menu"
├ button 28×28 radius full · aria "Ask Linear" (agent glyph, full path saved)
└ button 28×28 radius full · TRANSPARENT bg · aria "Clear selected" (✕ path saved)
```

Driven: clicking a second checkbox → "2 selected". **Escape did NOT clear the
selection** (bar still present after Esc) — dismissal is the ✕.

## Not measured

- Dark theme values (screenshot evidence only: selected rows carry a blue
  tint; checkbox border reads lighter).
- The exact ancestor that owns the checkbox reveal (see above).
- Shift-click range select and ⌘-click behaviour.
- The "Actions" popover contents (aria says it opens the command menu scoped
  to the selection — not driven).
- What "Ask Linear" does from the bar.
- The selected ROW ground in light (probe returned the hover grey — suspect;
  the dark screenshot shows a blue-tinted fill).
- Bar enter/exit animation.
- X hotkey toggling selection from the keyboard (tooltip claims it; not driven).

---

# Row checkbox + Display-options panel — MEASURED 2026-08-28

CDP :9222, Edge 151, dark, viewport 1432x723, on
`linear.app/test-48bd-dd25/team/TES/documents`
(`scratchpad/ref-radius2.json`, `ref-display2.json`).

## The row checkbox — read the WRAPPER, not the input

A probe that reads `input[type=checkbox]` concludes there is no chrome
at all: the input is a bare **12x12** with `border-radius: 0` and
`border: none`, and both its pseudo-elements are `content: none`. The
visible control is its PARENT:

| | value |
|---|---|
| box | **14 x 14** |
| radius | **3px** |
| border | **1px solid lch(48.72 1.48 272)** |
| background | transparent at rest |

So `size-3.5 rounded-[3px]` is correct and now cited — it reads as an
off-scale radius to `pb-design/radius-vocabulary`, and it is measured.

**Hit area:** that wrapper carries a `::before` of **30 x 44** — more
than four times the glyph, and roughly the full row height. We have not
reproduced that; ours is the 22px cell. Worth doing, since a 14px
target is small.

## Display-options panel

Trigger: `aria-label="Display options"`, 28x28 at (1388,60).
Panel **301 x 224** at (1115,93).

Rows: `Grouping / Project`, `Ordering / Name` + direction,
`Show inactive projects`, `Show only my projects`,
`Display properties` → `Owner`, `Last edited`, `Created`.

| control | box | radius | ground |
|---|---|---|---|
| value button (`Project`, `Name`) | 24 tall | **8px** | `lch(17.349 1.139 272)`, 0.5px border |
| direction toggle (`aria-label="Direction"`) | **24 x 24** | **9999px** | transparent, 0.5px border |
| display-property chip, ON (`Owner` …) | 24 tall | **9999px** | `lch(25.834 1.525 272)`, 0.5px border |

Our direction toggle was `rounded-[6px]`, chosen by eye — a real miss
the radius rule caught. Now `rounded-full` with the 0.5px hairline.

## Not measured

- The two `Show …` toggle rows' own control chrome (switch vs checkbox).
- Every value above is DARK only.
- The `::before` hit area's exact offset relative to the 14px control —
  30x44 is its size; where it is anchored was not read.
- Chip ground in the OFF state.
