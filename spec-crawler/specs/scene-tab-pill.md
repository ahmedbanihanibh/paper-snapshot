# Scene tab pill (segmented route tabs)

The `Overview / Documents / Members` row under the scene header on a Linear team
page. This is the primitive PB's dashboard tab pills must match.

- **Captured**: 2026-08-21, live `linear.app`, Edge over CDP, viewport 1432x723.
- **Entry path**: Sidebar > Your teams > `Test workspace bb` > `Home`
  -> `/team/TES/overview`. The row renders under the scene header at `y = 60.3`,
  first pill left-aligned at `x = 252.5`.
- **Theme captured**: LIGHT only. Dark values below come from the Paper capture
  `1XI-0` (`019-composer-collapsed-750`), not from a live dark measurement.
- **Bundle**: `spec-bundle/` ids `007`, `008`, `010`.

## The inversion — read this first

The selected pill is **not** the raised one. Linear does the opposite of the
obvious thing:

| | fill | label | elevation |
|---|---|---|---|
| **Selected** (current route) | grey, contrasts against the scene | high-contrast, near-black | hairline ring ONLY — sits flush/inset |
| **Rest** (other routes) | white, same as a button surface | muted grey | hairline ring **+ lift shadow** — raised |

So the unselected tabs read as buttons you can press, and the selected tab reads
as one already pressed in. A design that gives the selected pill the drop shadow
has the metaphor backwards.

## Geometry — identical in every state

| property | value |
|---|---|
| height | `28px` |
| min-width | `28px` |
| max-width | `200px` |
| width | `auto` (content-sized — never a pinned px width) |
| padding-inline | `10px` |
| border-radius | `9999px` |
| border | `0.5px solid transparent` (`#00000000`), `background-clip: padding-box` |
| display | `inline-flex`, `align-items:center`, `justify-content:center` |
| flex-shrink | `0` |
| gap between pills | `8px` |
| font | `"Inter Variable"` `12px` / `normal`, weight `500` |
| white-space | `nowrap`, label is `overflow:hidden` + `text-overflow:ellipsis` |
| transition | `border, background-color, color, opacity` @ `0.15s` |

Measured pill rects in the row: `252.5 / 336 / 430` at `y=60.3`, widths
`75.5 / 86.4 / 75.5` — i.e. gaps of exactly `8px`, widths purely from content.

## The ring is a separate absolutely-positioned child

The hairline and the lift shadow are **not** on the `<a>`. They live on a
sibling overlay `div`:

```
position:absolute; inset:0; height:27px; pointer-events:none;
border-radius:9999px; transition: box-shadow 0.15s;
```

Height is `27px` against a `28px` parent — the 0.5px transparent borders account
for the difference. Separating the ring is what lets fill and elevation
transition on different curves.

## Light values (measured)

```
selected   background lch(93.483 0.5 282)
           color      lch(9.794  0    282)
           overlay    lch(0 0 0 / 0.09) 0 0 0 0.5px,
                      #00000000 0 0 0 0

rest       background lch(99.997 0.5 282)
           color      lch(39.176 1.25 282)
           overlay    lch(0 0 0 / 0.09) 0 0 0 0.5px,
                      lch(0 0 0 / 0.02) 0 3px 6px -2px,
                      lch(0 0 0 / 0.04) 0 1px 1px 0
```

Token hooks exposed on the element (useful for hover work):

```
--btn-overlay-shadow        0 0 0 0.5px lch(0% 0 0 / 0.09), 0 0 0 0 transparent
--btn-overlay-shadow-hover  0 0 0 0.5px lch(0% 0 0 / 0.09), 0 0 0 0 transparent
--btn-highlight-bg          lch(94.854% 0.5 282 / 1)
--btn-highlight-color       lch(19.588% 1.25 282 / 1)
```

## Dark values (from Paper capture 1XI-0, NOT live-measured)

```
selected   background #29292B
           color      #FFFFFF
           overlay    #FFFFFF23 0 0 0 0.5px

rest       background #1C1C1D
           color      #959597
           overlay    #FFFFFF23 0 0 0 0.5px,
                      #0000004D 0 0.5px 1px 1px
```

Same inversion holds: selected has the ring only, rest carries the extra shadow.

## Selection is an attribute, not a CSS state

The pill is an `<a href>` carrying `data-active` / `data-disabled`. It expresses
selection through **JS attributes, not `:hover`/`:active` CSS**, which has two
consequences:

1. `capture_state_matrix` reports hover/focus as "structurally identical" and
   skips them — the pointer states change colour, not structure.
2. The bundle's structural dedupe **cannot tell selected from rest**. Capture
   `010` (the whole row in one known state) exists precisely because two
   separate single-pill captures were silently deduped into one. Read
   selected-vs-rest off a single row capture, never off two visits.

`[data-disabled="true"]` drops `opacity` to `0.6`.

## Not measured

- **Hover fill and hover ring, in either theme.** The `--btn-overlay-shadow-hover`
  token is identical to the rest token, which means hover changes the
  *background*, not the shadow — but the hovered background value was never
  read. Force `:hover` and read `background-color` off both a selected and a
  rest pill.
- **Active/pressed fill.** Pressing navigates, so it needs `force_state`.
- **Focus-visible ring.** CSS reports `outline-width: 3px` and
  `outline-offset: calc(-1 * var(--focus-ring-width))`, but neither
  `--focus-ring-width` nor the resolved outline colour was captured.
- **All dark-mode values.** Everything in the dark table is second-hand from a
  Paper frame. Re-measure live with the theme switched.
- **Overflow behaviour** past `max-width: 200px`, and what happens when the row
  is wider than the scene column.
- The row's own container padding and its offset from the scene header.
