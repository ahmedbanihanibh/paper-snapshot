# Linear issues — Board layout (task #69)

Captured 2026-08-24 over CDP on test-workspace-bb/team/TES/active,
light. Trees in spec-bundle/extracted/: linear-board-column-tree.txt,
linear-board-card-tree.txt, linear-board-colheader-tree.txt,
linear-board-hiddenrail-tree.txt.

## Entry
Display options (topbar) → the popover's List/Board segmented toggle
(buttons carry aria-label "List" / "Board").

## Display-options popover (301w) — full inventory
List | Board segmented toggle · Grouping: Status · Sub-grouping: No
grouping · Ordering: Priority · "Order completed by recency" ·
Show sub-issues · List options: Nested sub-issues, Show empty groups ·
Display properties chips: ID, Status, Assignee, Priority, Project,
Due date, Milestone, Cycle, Label.

## Board geometry
- Columns 348w, side by side starting at the content left edge; a
  sticky right rail "Hidden columns" (338×50 header, "Collapse group"
  pill 12px/500 with chevron) holds zero-count/hidden statuses.
- Column ground: `linear-gradient(lch(94.44% .5 282 / .4),
  lch(94.44% .5 282 / .1))` painted on the column body (via a CSS var).

## Column header (348×50, padding 2px 12px 0 18px)
- header wash: absolute inset-x-4 bg lch(94.44 .5 282 / .4),
  radius 5px 5px 0 0 (top corners only).
- sticky cluster: 14px status icon (ring + dot circles) · name 13/500
  foreground · count 13/450 muted (grid 14px/auto/auto, 2px gap after
  icon).
- right: two 24×24 round buttons — ⋯ ("Open menu") + add — opacity
  reveal.

## Card (wrapper 324×141; link 322×133)
- wrapper: `transition: transform 0.2s cubic-bezier(.25,.46,.45,.94)`
  — cards FLIP-animate to their new slot.
- DROP SLOT: a sibling 304×1 hairline (bg lch(94.44 .5 282), r:8,
  0.5px border lch(89.84 0 282)) absolutely positioned ABOVE the card,
  `transition: opacity 0.1s` — the between-cards indicator is a
  pre-rendered per-card element faded in, not an injected node.
- card `<a>`: bg white, radius 8, shadow ring
  `0 0 0 0.5px lch(0 0 0/.088)` + `0 …  lch(0 0 0/.02)`, padding 8,
  `transition: background-color .1s` (hover wash — NOTE our house rule
  paints color same-frame; ours omits the color transition).
- content: header row justify-between — left column gap-6 pr-34 pl-4
  (ID line 15h, then title block up to 2 lines 32h), right 18×18
  assignee avatar ABSOLUTE top-right (8,8).
- property chip rows: 24h pills radius 48, 0.5px border lch(86.5 0 282)
  (status chip filled white bg; label chips transparent border), first
  row mt-10, second mt-6, gap-4, overflow hidden.
- vertical rhythm: cards stack at 141px pitch (133 card + 8 gap via
  wrapper padding 0 1px 8px 1px). Height accounting: p-8 + header row
  53 (ID 15 + gap 6 + title 32) + chip row1 mt-10 24 + chip row2 mt-6
  24 + p-8 = 133. Row2 holds the "Created <Mon D>" chip (90×24,
  transparent border; its font was not in the tree — estimated 12px
  muted in the build).
- Check-glyph pivot (status morph): transform-origin 0 0,
  transform-box view-box (probed computed style).

## Drag mechanics (measured 2026-08-24 — capture_drag gesture
## board-card-drag, frames spec-bundle/debug/gesture-board-card-drag-*,
## + mid-drag CDP computed-style probe)
- Source slot: while the pointer is over the source column (or between
  columns) the slot holds a solid placeholder plate 304×120.5 — bg
  lch(94.44 .5 282), r:8, border 0.5px solid lch(89.84 0 282) (the
  pre-rendered drop-slot hairline grown to slot size). Once the card
  projects into another column the source column COLLAPSES the slot
  (cards below FLIP up).
- Between columns: a full-card ghost (white card, ring + shadow)
  follows the pointer at the grab offset.
- Over a target column: the floating ghost disappears and the card
  renders IN-FLOW at its projected priority-ordered slot at full
  opacity; the column's other cards fade (~0.25 — estimated from the
  frame, computed opacity not captured). NO whole-column wash.
- Insertion hint under the projected card: "Hold ⌘ to also change
  priority" — 12px/500, color lch(19.588 1.25 282), transparent bg
  (⌘ at drop re-ranks the card to its slot position). NOT wired in
  ours — we have no positional insert; flagged to Ahmed.

## Status morph (capture_animation, driven Todo→Done on TES-68, 2026-08-24)
Icon anatomy (extracted live): svg 14×14 — ring circle r6 sw1.5 +
pie circle r3 sw6 rotate(-90 7 7) dasharray "C 2C" (C=18.8496)
filled by dashoffset + check path fill lch(97.94% .5 282) (background).
- pie/ring: transition all 350ms ease — r 2→3, stroke-width 4→6,
  stroke-dasharray 12.1894/24.3788 → 18.8496/37.6991,
  stroke-dashoffset 12.1894→0, stroke grey→status color.
- check: CSS animation 350ms delay 200ms, easing
  cubic-bezier(0.5, 1.4, 0.4, 1) (~5% overshoot):
  translate(3.5px,3.5px) scale(.5) + opacity 0 → identity.
- row label color fades 150ms ease (NOT replicated — house rule:
  color chrome paints same-frame).
Built: components/work-items/status-icon.tsx (WorkStatusIcon) + the
.wi-status-morph/.wi-status-check rules in globals.css. in_progress
(0.5) / in_review (0.75) pie fractions DERIVED from the static icons,
not captured mid-morph. backlog/canceled/duplicate stay static swaps.

## Dark theme (measured 2026-08-24, live dark-mode probe)
- Column ground: NO gradient — transparent (the page ground shows).
- Header wash: lch(2.595 0.4 272 / 0.4).
- Card: bg lch(9.232 0.85 272), ring lch(100 0 0 / 0.083) 0 0 0 0.5px
  + lch(0 0 0 / 0.3) 0 0.5px 1px 1px, r:8.
- Status chip: bg = card bg, border lch(20.032 1.93 272).
- Rail row: bg = card bg, border lch(16.793 1.93 272), shadow
  lch(0 0 0/.3) 0 0.5px 1px 1px (single layer in dark).
- Slot/placeholder dark values still derived (mid-drag not captured
  in dark).

## Drag extras (measured 2026-08-25)
- EDGE AUTO-SCROLL: SUPERSEDED — see the ramp table below. The old
  "~196px/s at ~20px" was one reading at one distance.
- ESCAPE CANCELS the drag: card restores, no status write.

## Sub-grouping + swimlanes (measured 2026-08-25 — the tagged-id
recipe WORKED: spec-crawler click on Display options → 2nd combobox →
ArrowDown/Enter; raw-CDP dump-tree connections in between CLOSE the
popover, so drive via the crawler session and only probe styles after
the view state is applied)
- Sub-grouping SELECT (2nd combobox in the display popover): popover
  118×225 r:12, rows 24h, inventory in order: No grouping ✓(check
  svg) · Status · Assignee · Agent · Project · Priority · Cycle ·
  Label · Parent issue.
- With Sub-grouping=Assignee the board becomes SWIMLANES: column
  headers stay in ONE shared sticky top row (they are NOT repeated
  per lane); each lane gets a full-width header row above its cards.
- Lane header row: 35h, flex align-center gap-12px, transparent bg,
  STICKY top:50px z:13. Contents: [Collapse group button 24] ·
  avatar 18×18 · name 13/500 lch(19.588 1.25 282) · count 13px
  lch(39.176 1.25 282) · [17w button] · [Open menu ⋯ 24].
- Lanes observed: "Ahmed Banihani 10" then "No assignee 50" (No
  assignee lane LAST). Selecting an option applies instantly; view
  state persists per view.
- State restored to Sub-grouping: No grouping after capture.
- **CROSS-LANE DROP REASSIGNS** (measured 2026-08-25, crosslane2.mjs):
  dragging TES-54 from the "No assignee" lane into the "Ahmed Banihani"
  lane WITHIN THE SAME status column set assignee = Ahmed Banihani.
  Confirmed by two independent signals, neither of them layout: the
  card gained an "AB" assignee avatar while untouched TES-47 in the
  same lane did not, and the issue's own Properties panel read
  "Ahmed Banihani" (it read the unassigned "Assign" placeholder again
  after restoring). So a drop writes BOTH the column's dimension
  (status) and the lane's dimension (the sub-group field).
  METHOD TRAP: do NOT infer a card's lane from y-position. Lane
  headers are `sticky top:50`, so a scrolled card sits UNDER the
  pinned header of the lane above and a "last header above the card"
  test reports the wrong lane. Use the card's own rendered assignee,
  or the issue page.
- Assignee picker inventory (from the issue's Properties panel):
  "No assignee 0 0" · "AB Ahmed Banihani 1 1" · "Cursor" ·
  "Invite and assign…" — counts trail each name.

## Not measured
- COLUMN DRAG-REORDER: measured NEGATIVE 2026-08-25, CONFIRMED with
  a second differently-shaped probe (600ms press-hold then 10-step
  incremental drag with pauses, colreorder2.mjs) — headers unchanged
  both times. Status columns do not reorder by header drag (column
  order comes from workflow state positions in settings).
- Swimlane collapsed state, lane drag between lanes (does dropping a
  card in another lane reassign?), lane header hover states, the
  17w unlabeled lane-header button's action.
## Edge auto-scroll is RAMPED (measured 2026-08-25, autoscroll3.mjs,
right edge, two 700ms samples per distance, viewport 1046 wide)
| distance from edge | px/s |
|---|---|
| 140 | ~68 |
| 110 | ~177 |
| 90  | ~283 |
| 70  | ~498 |
| 50  | ~543 |
| 15  | ~670 |
Scrolling is active at least 140px out and accelerates toward the
edge — NOT the "~40px zone at a constant ~196px/s" the earlier
one-distance sample suggested. That earlier figure was a single
reading at ~20px under a narrowed viewport and is superseded.
Our build now uses a linear ramp 70→700 px/s across a 140px zone.
NOT measured: distances beyond 140 (so the zone's outer bound is
">= 140", not exactly 140), the left edge (assumed symmetrical), and
vertical auto-scroll in swimlane mode.

## Board-mode display toggles (measured 2026-08-25, toggles-read.mjs)
Three switches in the display popover (board mode): "Order completed
by recency" (off) · "Show sub-issues" (on) · "Show empty columns"
(off) — the list's "Show empty groups" is RENAMED "Show empty
columns" in board mode. With it ON (emptycols.mjs): zero-count
states (In Review 0, Duplicate 0) render as full columns in the main
flow with the Add-new-issue affordance, and the hidden-columns rail
DISAPPEARS entirely (the rail exists only while empty columns are
hidden). Toggled back off after capture.
- The Hidden-columns rail expanded state.
