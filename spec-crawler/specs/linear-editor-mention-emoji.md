# Linear editor — @-mention + :emoji: suggestion popups (task #35)

Captured 2026-08-24 over CDP 9222, light theme, disposable doc
`linear.app/test-workspace-bb/document/untitled-dd8fcff0b254` (cleaned to 0
chars after each probe). Trees:
`spec-bundle/extracted/linear-emoji-suggest-tree.txt`,
`linear-mention-suggest-tree.txt` (@ unfiltered → Projects section),
`linear-mention-people-tree.txt` (`@ah` → Users section).

## Entry paths

- `:` + ≥2 chars (`:sm`) in the doc body → emoji suggestion popup at the caret.
- `@` → reference-mention popup at the caret. Unfiltered on this workspace it
  led with a **Projects** section (project icon rows, trailing status label
  "Canceled" in muted); `@ah` filtered to a **Users** section with the member
  row. So @ is a cross-entity mention (users + projects at minimum), grouped
  under section headers.
- Both popups are popper-anchored to a ZERO-WIDTH wrapper at the caret
  (absence-probe class: geometry filters miss it; detect by row text →
  positioned ancestor).

## Shared suggestion surface (identical chrome in both popups)

- wrapper: `position: fixed`, content-sized (emoji list 191w; mention 351w) —
  width fits content, no fixed width.
- surface: bg `lch(100 0 282)` (white), `border-radius: 10px`,
  `border: 0.5px lch(91.9 0 282)`, `overflow: hidden`.
- inner scroller: flex column, shadow `lch(0 0 0/0.02) 0 6px 18px,
  lch(0 0 0/0.04) 0 3px …`, `overflow-y: auto`; measured heights 417 (emoji),
  105/71 (mention) — max-height not hit in these captures.
- list padding: `4px 0`.

## Section header row (mention popup)

- 28h, padding `0 14px 2px`, label 12px/500 `lch(40 1 282)` — "Users",
  "Projects".

## Option row (both popups)

- 34h, full-width, padding `0 14px`, flex row ai:center gap:16
  justify-between.
- selected plate: absolute child inset 4px horizontally (342 wide in a 350
  row), full 34h, `border-radius: 6px`, bg `lch(95 0 282)`; only the selected
  row's plate is painted (arrow keys move it — verified ArrowDown moved plate
  row0→row1).
- content: flex row gap:8, padding `6px 0`, overflow hidden.
  - leading box: 20px wide, flex jc:center.
    - emoji glyph: 15px font.
    - user avatar: 18×18, `border-radius: 50%`, initials 9px/400 white on
      color bg (`lch(55 60 40)` for AB).
    - project icon: 16×16 svg (sprite `<use>`).
  - label: 13px/450 `lch(10 0 282)`, overflow hidden ("Ahmed Banihani",
    ":smiley:", project name).
  - trailing meta (project rows): 13px/450 `lch(66 1 282)` ("Canceled").

## Emoji list content (query "sm")

😃 :smiley:, 😄 :smile:, 🙂 :slightly_smiling_face:, 😀 :grinning:,
😅 :sweat_smile:, 😉 :wink:, … — shortname order by match relevance; rows show
glyph + `:shortname:`.

## Behaviors verified

- typing after `:`/`@` filters the list live.
- ArrowDown moves the selected plate.
- Escape closes the popup and leaves the typed text.

## Not measured

- Enter/Tab insertion — Enter over raw CDP (rawKeyDown) closed the popup
  without inserting; could not distinguish select-vs-dismiss from outside.
  Assumed Enter+Tab select (Linear docs behavior); verify by hand if it
  matters.
- Dark theme values (light only this pass; chrome matches our existing menu
  tokens which are per-theme).
- Max-height / overflow behavior of the popup (never exceeded viewport in
  these captures).
- Issue/document/cycle rows in the @ menu (workspace had none reachable in the
  unfiltered top slice); multi-user ordering (single-member workspace).
- Hover state on rows (plate follows keyboard; pointer hover not probed).
- URL-paste chip behavior — captured in an earlier session (#33/P1 notes):
  pasted URLs become inline link chips; not re-measured here.
