# Sidebar rows: wash geometry, states, metrics

Measured from Linear at 1440×900, signed in, 2026-08-10.

---

## 1. The wash — the priority question, answered

**The trailing cluster sits INSIDE the wash.** The wash is not a background on the
label area; it is the row itself, edge to edge, and every trailing affordance is
drawn within it.

| | |
|---|---|
| sidebar (`<nav>`) width | 244px, padding 0 |
| wash box | **220 × 28**, at x=12 — so a **12px inset from both** sidebar edges |
| radius | **8px** |
| element | the row's own `<a>` |
| trailing affordance | create-folder button spans x=206…230 |
| containment | wash spans x=12…232, so the affordance is inside it with **2px of wash to its right** |

So: **one pill covering the whole row.** If protocolbase's wash stops short of the
trailing cluster, that is a markup restructure — the background belongs on the row
element, with the trailing controls as children — not a padding tweak.

### The four states

| state | background |
|---|---|
| unselected · rest | `transparent` |
| unselected · hover | `lch(8.445 1.3 272)` |
| **selected · rest** | `lch(13.845 1.3 272)` |
| **selected · hover** | `lch(13.845 1.3 272)` — **unchanged** |

Two things here are easy to get backwards:

- **Selected is lighter than hover**, not darker (L 13.8 vs 8.4). Selection outranks
  hover visually.
- **Hovering an already-selected row does nothing to the background.** No stacking,
  no darkening. A naive `:hover` rule on top of a selected rule produces a third
  shade Linear never shows.

### Only the label animates

```
transition: color 0.15s
```

The background is **not** transitioned — the wash appears on the same frame as the
pointer. The label colour is what fades, over 150ms. Putting a transition on the
background makes the sidebar feel laggy in exactly the way Linear does not.

| | |
|---|---|
| label · rest | `lch(60.621 1.2 272)` |
| label · hover or selected | `lch(100 0 272)` |

---

## 4. Row metrics

| | |
|---|---|
| row | 220 × 28, radius 8px, at x=12 |
| row pitch | 29px |
| icon | 14 × 14, **+8px** from the row's left edge |
| label | **+28px** from the row's left edge |
| icon → label gap | **6px** |
| label type | 13px / weight 500 |

The row's own horizontal padding reads as `8px / 9px` on the inner content wrapper;
the icon offset of +8 is the load-bearing number.

---

## 3. Section header row — partial

| | |
|---|---|
| band | same 220 × 28 row box |
| label type | **12px** / weight 500 (nav rows are 13px — headers are a step smaller) |
| trailing affordance | 24 × 24 at x=206, 14 × 14 glyph |
| reveal | `opacity` 0 → 1, `0.15s`, on hover of **the header row**, not the whole section |
| pointer-events | stays `auto` at opacity 0 — technically clickable while invisible |

**Not measured:** the caret's rotation states. The Favorites section was expanded
throughout and I did not drive it collapsed while reading the caret's transform,
so I have no rotated value and will not infer one from the expanded one.

---

## 2. Nesting / indent — MEASURED

A real non-folder favourite (`Active issues`, confirmed an item because its
affordance is the ✕) was dragged into a folder and the nesting verified
**independently of the drag**: collapsing the folder hid the child, re-expanding
brought it back.

| | row box | icon | label |
|---|---|---|---|
| folder row | x=12, w=220 | +10 | +30 |
| child row | x=12, w=220 | **+23** | **+43** |
| delta | **0** | **+13** | **+13** |

### The indent is on the content, not on the row

This is the part that matters. The child's row box is **byte-identical** to the
folder's — same x, same width — so **the wash still spans the full 220px at every
depth**. Only the icon and label shift right by 13px.

A model where indent drives the row's left edge (and the wash with it) produces a
visibly different sidebar: nested rows get a narrower, inset wash. Linear's nested
rows keep exactly the same pill.

### No indent guide rule

A sweep for thin vertical elements (width ≤ 4px, any background or left border) in
the folder's band returns **nothing**. There is no tree line.

### Folders do not nest — there is only one level

Dragging a folder onto another folder reorders it: `cascas` moved from y=433 to
y=346 at x=12, unindented. So Linear has exactly one level of nesting, and no
per-level step exists to measure. **A depth multiplier is a protocolbase
invention** — free to choose, with 13px as the level-1 precedent.

---

## 5. Trailing count badge — NOT MEASURABLE HERE

There are **no numeric badges anywhere in Linear's sidebar in this workspace** — a
sweep for digit-only leaf nodes in the sidebar band returns nothing. Nothing is
unread and no team has a count.

So I cannot tell you whether Linear swaps count → "+" on hover or shows both. The
`2 +` in the protocolbase screenshot is, on this evidence, **yours** — no
equivalent exists in Linear to copy.

Two ways to close this: generate unread state in the throwaway workspace (I can do
this if you want it), or treat the badge as a protocolbase-original and design it
against the primitives rather than against a reference.

---

## Deltas to check against protocolbase

1. **Does the wash cover the full row including trailing controls?** If not,
   restructure — background on the row element, controls as children.
2. **Is the wash inset 12px from both sidebar edges, at 220px wide in a 244px nav?**
3. **Is selected lighter than hover, and does hover leave a selected row alone?**
4. **Is the background un-transitioned, with only `color 0.15s`?**
5. **Are section header labels 12px against nav rows at 13px?**
