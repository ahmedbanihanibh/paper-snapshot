# Linear — the diagram block's context menu (#136)

Captured 2026-08-28, raw CDP on :9222 (Edge 151), 1432×723, dark,
`linear.app/test-48bd-dd25/document/example-document-b550ded309ec`.

## This task was previously closed as "blocked on a human capture". That was wrong.

The earlier attempt concluded *"a CDP right-click reaches selection but never
opens the menu — the entry path is unknown; next attempt should be a
human-driven capture"*. It was measured on a **backgrounded tab**. With
`Page.bringToFront` first, a single real right-click at the diagram's centre
opens the menu in under 500ms, every time.

The general rule this belongs to is now in `checklist.md`: a backgrounded tab
dispatches `Input.dispatchMouseEvent` at **~5s per event** and opens no overlay
at all, which is indistinguishable from "the control does nothing". Bring the
tab to the front before drawing any conclusion about an unreachable state.

The real right-click is safe **here** specifically: the diagram handles
`contextmenu` and calls `preventDefault`, so Chromium's own menu never appears.
That is not a general licence — see
`feedback_real_right_click_wedges_the_browser.md`.

## Entry path

Real right-click (`Input.dispatchMouseEvent`, `button: "right"`) at the centre
of `.diagram-container`. Pointer parked away, walked in, rect re-read after
`scrollIntoView` settled.

## Surface

**152 × 180**, opening at the pointer (`[597, 374]` for a click at `[597, 370]`
— so ~+4y, aligned to the click x).

| | value |
|---|---|
| bg (computed) | `lch(12.72 0.85 272)` |
| bg (pixels, inner) | `#262627` |
| border | `0.5px solid lch(34.32 1.93 272)`; edge reads `#515254` in pixels |
| radius | `10px` |
| padding | `4px 0` |
| shadow | `0 3px 8px, 0 2px 5px, 0 1px 1px` all `lch(0 0 0 / .125)` — our `--popover-shadow` dark |

## Inventory — 5 rows, 1 separator

| top | row | h | icon |
|---|---|---|---|
| 5 | `Add comment` | 32 | 1 |
| 37 | `Copy diagram` | 32 | 1 |
| 69 | `Show source` | 32 | 1 |
| 106 | **separator** (`#3E3F42`) | 1 | — |
| 112 | `Fullscreen` | 32 | 1 |
| 144 | `Delete` | 32 | 1 |

Every row: 32h, padding `0 14px`, font **13px / 400**, colour
`lch(91.178 1.425 272)`, exactly one leading icon.

**`Delete` is rendered PLAIN — the same colour as every other row.** Not
destructive-red. This is the anti-drift rule ("never invent a colour the
capture doesn't show") confirmed on a live sample.

The label is `Delete`, with no ellipsis.

## The hover plate — DOM says nothing, pixels say otherwise

`backgroundColor` and `boxShadow` are **unchanged on hover at every one of the
five ancestor layers** under `elementFromPoint`. That is not the answer; it is
the instrument failing. Two clipped screenshots (pointer off the menu, then on
`Copy diagram`) differ in 35,348 pixels and settle it:

- ground `#262627` → **hover plate `#353537`**
- plate spans x 602…743 inside a panel whose inner edges are 598 and 744 →
  **inset ≈ 4px** each side, **not** full-bleed
- corner scan at the plate's top edge: first plate pixel per row runs
  607 → 604 → 603 → 603 → 602 over ~5 rows ⇒ **radius ≈ 5px**

Note these are Linear's numbers *for this menu*: 4px inset / ~5px radius, which
is **not** the 6px-padding / `rounded-[8px]` anatomy measured on its other
menus. Do not assume one menu's plate geometry is the house's.

**The highlight is a CURSOR, not CSS `:hover`.** In the "cold" capture — pointer
parked well outside the menu — the previously hovered row (`Delete`) was
*still* plated. It moved to `Copy diagram` only when the pointer entered that
row. A pure `:hover` would have cleared when the pointer left.

## What this unblocks

- **#130** (rebuild the diagram block 1:1): the control set is now known from
  both directions — the hover pill (comment-with-plus · copy · `</>` source ·
  divider · expand) and this context menu (Add comment · Copy diagram · Show
  source · │ · Fullscreen · Delete). They agree, and neither contains a `⋯`.
- **#119** (fullscreen): confirms `Fullscreen` is reachable from here, which is
  a second entry path for capturing the overlay.

## Not measured

- **Light theme.** Everything above is dark.
- What each row *does* — no row was clicked. `Delete` in particular was not
  fired, deliberately.
- Whether the menu has a keyboard cursor (arrow keys) and what chord, if any,
  each row carries — the rows showed no chord text.
- The five icons themselves (not extracted).
- The menu's open/close animation.
- Whether the same menu appears on the *second* diagram in the document, or on
  a diagram in **source** mode rather than rendered.
