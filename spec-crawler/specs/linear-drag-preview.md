# Drag preview — what you carry, and what you leave behind

Captured 2026-08-26 against `linear.app/test-48bd-dd25/team/TES/overview`,
**light theme**, viewport 1432×723, via `capture_drag` (spec-crawler) plus a
raw-CDP pointer drag that reads computed styles mid-gesture
(`scratchpad/drag-plate-spec.mjs`). Entry path: press on a 712×42 resource
row at +60px from its left edge, then 8 pointer moves of (+2, −9).

## The finding that changes the implementation

**Linear does not use HTML5 drag-and-drop here.** There is no drag image.
The thing under the cursor is a **live DOM element** — `capture_drag`
reported it as `portalled: false` with a rect whose `y` tracks the pointer
across frames:

```
frame      grab    drag-8%   drag-50%   drag-100%
carried    y 641   y 629     y 573      y 506      (x 326 → 328 → 331)
```

So the gesture is pointer-driven (dnd-kit signature: the source carries
`aria-roledescription="draggable"`), and the "preview" is just a copy of
the row rendered in a fixed, translated wrapper.

## Measured

### The SOURCE row — stays in place, dimmed

| property | value |
|---|---|
| `opacity` | **0.3** |
| `cursor` | **grabbing** |
| `transition` | `all` |
| rect | unchanged (326, 411, 712×42) |

The dim is on the row itself, not on an ancestor — the four ancestors
above it all read `opacity: 1`.

### The CARRIED plate — follows the pointer

Wrapper:

| property | value |
|---|---|
| `position` | **fixed** |
| `z-index` | **1000** |
| `transform` | `translate(dx, dy)` — measured `matrix(1,0,0,1,16,-72)` after a (+16,−72) pointer delta |
| rect | 712×42 — the source row's own size |

So the translate is the **pointer delta since grab**, applied to the
source row's origin. The grab point inside the row is preserved exactly;
nothing snaps to the cursor.

Inner plate:

| property | value |
|---|---|
| size | 712×**40** (2px inset inside the 42 wrapper) |
| `border-radius` | **8px** |
| `background` | **`lch(97.94 0.5 282)`** |
| `box-shadow` | `lch(0 0 0 / 0.02) 0 6px 18px 0`, `lch(0 0 0 / 0.04) 0 3px 9px 0`, `lch(0 0 0 / 0.04) 0 1px 1px 0` |
| `transition` | `all` |

The resting row's own plate is `lch(94.44 0.5 282)`, so the carried plate
is **one step LIGHTER than the row it came from**, plus a three-layer
shadow. It reads as lifted, not as selected.

> Write these as rgba, not lch: Lightning CSS silently drops `lch()` from
> custom properties (`feedback_lightningcss_drops_lch_custom_props`).
> `lch(0 0 0 / α)` is pure black — `rgba(0,0,0,0.02)` etc.

### The DROP TARGET — a plate around the whole section

`s2717`, appearing from the 50% frame: **728×95** at (318, 509) while the
target section's own content box is 712 wide. So the target plate bleeds
**8px on each side** of the content column and spans the section's full
height. This is the same "drop into a container" feedback we already
implement as a wash.

### Bonus finding, not built

During the drag, **six sidebar favourites rows light up as drop targets**
(`s2674`, `s2685`–`s2689`, `s2699` — the Favorites section's rows and
folders). Linear lets you drag a team resource straight into the sidebar
favourites. We do not, and this spec is the first record that the
capability exists.

## Not measured

- **Dark theme.** Every number above is light. Linear's theme is an app
  setting, not `prefers-color-scheme`, so `Emulation.setEmulatedMedia`
  does not flip it and the capture would need the account's theme changed.
  The carried plate's dark background and shadow are therefore unknown —
  do NOT infer them by inverting these.
- Whether the carried plate **tilts or scales** at any point (all four
  frames read `transform` as a pure translate, but the capture samples 4
  frames, not the whole curve).
- Multi-select drag: whether carrying N rows shows N plates, a stack, or a
  count badge. Never reached — the surface has no multi-select.
- The **cursor** during the carry beyond the source's `grabbing`.
- Auto-scroll behaviour when dragging past the viewport edge.
- Touch/pen input.
- What happens when a drag is released over the sidebar rows above.

## Not measured — the off-target mark (#151), and WHY (2026-08-28)

Question: mid-drag, when the pointer leaves every drop target, does the
reference KEEP its insertion mark at the last valid position or CLEAR it?
Ours keeps it (measured). Theirs is unknown.

**Linear's sidebar reorder could not be driven from CDP.** Three
mechanisms, all negative — recorded so nobody repeats them:

| Mechanism | Result |
|---|---|
| Synthetic `DragEvent` (dragstart/enter/over + DataTransfer) | dispatched, `defaultPrevented:false`, subtree byte-identical (308 elements, no class change, source opacity 1). Ignored. |
| `Input.setInterceptDrags` + mouse press/move (the trusted-event path) | `Input.dragIntercepted` never fired — no payload to steer `Input.dispatchDragEvent` with |
| Plain mouse press → move → release | no reorder committed; visual order identical before and after |

The rows carry `draggable="true"`, yet neither the native nor the pointer
path responded.

**The measurement trap this produced, which matters more than the result.**
Mid-attempt the sidebar reported SIX draggable rows including a DUPLICATE
`Inbox` at the same `y=61` — a drag ghost left mounted by an aborted
attempt. Reading DOM order and slicing the first four then returned a
different subset per run, which looked exactly like a reorder that had not
happened; I briefly recorded it as one. Read list order by COORDINATE
(sort by `y`), never DOM order, and reload to clear transient nodes before
comparing. Verified after reload: 5 rows, `Inbox@61 / My issues@90 /
Agent@119 / Projects@194 / Views@223` — the reference was never modified.

**Cheapest way to close this:** one human drag. Hold a rail row, park the
pointer off the rail, report whether the indicator stays. Or try the
FAVOURITES rail rather than the nav section — it may use a different sensor.
