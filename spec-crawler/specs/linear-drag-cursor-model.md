# Linear — the cursor during a drag

Captured 2026-08-28, raw CDP on port 9222, Chromium (Edge debug profile).
`linear.app/test-48bd-dd25/team/TES/overview`, dragging a team-resource row.
Board: #149 ("the cursor while dragging it changes its state based on hover
area which is not right").

## Entry path

`Page.bringToFront`, then a mouse-driven drag in ONE CDP session (press, every
move and the release on the same socket). This works because the rows are
POINTER-driven: the only `draggable="true"` elements on the page are the five
top nav links, and `Input.dispatchMouseEvent` cannot start a native drag
(`feedback_native_drag_cannot_be_mouse_driven.md`).

## Measured — the model is TWO mechanisms, and both are load-bearing

**1. Inline `cursor: grabbing` on `document.body`, for the duration.**

| phase | `document.body.style.cursor` |
|---|---|
| at rest | `(none)` |
| mid-drag | `grabbing` |
| after release | `(none)` |

`cursor` is an inherited property, so every element that does not set its own
cursor now reports `grabbing`. Measured mid-drag over an unrelated sidebar
area: hit element computed `grabbing`, `body` computed `grabbing`.

**2. `pointer-events: none` on interactive items during the drag.**

| element | at rest | mid-drag | after release |
|---|---|---|---|
| nav link `a[draggable=true]` ("My issues") | `auto` | **`none`** | `auto` |
| its `nav` ancestor | `auto` | `auto` | `auto` |
| `elementFromPoint(110,104)` | `SPAN` | **`NAV`** | `SPAN` |

**Why the second one is not optional:** mid-drag the nav link STILL computes
`cursor: default` on itself. Inheritance from `body` does not beat an element's
own declaration. What saves it is that the link is no longer hit-tested — the
hit lands on the plain `NAV` container, which has no cursor of its own and so
inherits `grabbing`.

So the guarantee is not "body wins". It is: **nothing that could contribute a
competing cursor is hit-testable while the drag is running.**

## Measured — there is no global cursor override

Scanned all 8692 CSS rules (recursing into `@layer` / `@media` groups):
87 `cursor:` declarations, of which the drag-related ones are

    .sx-1jm3nie      cursor: grab
    .sx-ch2mbi:active cursor: grabbing
    .sx-i9pz9s       cursor: grabbing
    .sx-v5twrn       cursor: move
    .editor.grabbing-cursor  cursor: grabbing
    .editor .todo-drag-handle cursor: move

There is **no** `* { cursor: … !important }` and **no** `body.dragging` rule.
The only `!important` cursors are `_colResizeCursor_lqj5v_1 { cursor:
col-resize !important }`, its row twin, a date-picker `not-allowed`, and
xterm — i.e. Linear DOES use a lock-class-with-`!important` pattern, but for
TABLE RESIZE, not for list drag. Drag uses the inline-body-style route
instead.

## Incidental, and worth knowing

Nothing on the team-overview page computes `cursor: pointer` — a scan for it
returned zero elements. Linear uses `default` everywhere (five DIVs carry an
inline `cursor: var(--pointer)`, a custom property). Buttons and links do not
get a hand cursor. That is a deliberate native-app feel, not an oversight.

## Ours, for comparison

`components/dnd/carried-plate.ts` sets `cursor: grabbing` on
`[data-dragging="true"]` — the SOURCE ROW only. Away from that row the cursor
is whatever the element under the pointer declares, which is exactly the
reported flicker. We already satisfy the hit-testing half for the CARRIER
(the plate is `pointer-events: none`, enforced by
`pb-design/drag-overlay-pointer-events`), but not for the rest of the page.

## Not measured

- Whether the `pointer-events: none` mid-drag applies to EVERY interactive
  element or only to drag-eligible ones. Only the nav link was sampled;
  the page had no `cursor: pointer` element to test the competing-cursor
  case a second way.
- Whether Linear sets the body cursor on drag START or on the first move past
  a threshold. Sampling began after the first move.
- Light theme. Nothing here is a painted value, so it should not matter, but
  it was not checked.
- The equivalent capture for the DOCUMENT block drag (`.editor.grabbing-cursor`
  suggests a different, editor-scoped mechanism there — class on `.editor`
  rather than an inline body style). Not the surface #149 was reported on.
