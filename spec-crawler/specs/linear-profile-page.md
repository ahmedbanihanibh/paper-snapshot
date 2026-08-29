# Linear — person profile page (`/{ws}/profiles/{username}`)

Captured 2026-08-24 over CDP on
`linear.app/test-workspace-bb/profiles/ahmedbanihani` (dark, 1432×723).
Entry paths: click a member row on the team Members page; person hover
card links here too.

## State ledger

| state | entry | captured |
|---|---|---|
| Assigned tab (default) | open the page | ✓ |
| Created tab | click Created | pill tabs same as My Issues (75/67×28 @y60) |
| empty column | a state with no issues renders no column? (Backlog 5 · Todo 1 · Done 4 shown; states with 0 absent from the board) | observed: only non-empty columns render |
| overflow | >N cards in a column | Not measured |

## Layout

- Breadcrumb: avatar chip + name (146×24 @235,18).
- Header right: three 28×28 buttons @1320/1354/1388 (filter · display
  options · details-panel toggle — labels not captured).
- Tabs row: `Assigned` `Created` pills @y60.
- **Board**: one column per non-empty state — header "Backlog 5" (label +
  muted count), columns 348 pitch starting x225; cards 306w.
- **Card** (~125 pitch incl. gap): line 1 identifier 45×15 muted +
  assignee avatar right; line 2 title 16h; optional chips row (project
  chip 139×24 w/ icon, label chip w/ dot, `#33` container chip);
  bottom line `Created Aug 12` 12px muted.
- **Right identity rail** — RE-CAPTURED deep (2026-08-24 second pass;
  the first pass read this as stacked sections, which shipped and was
  correctly rejected as invention — slop B3):
  - rail 403w (x1000–1403); avatar 44; H2 name (22h) over
    `username ⋅ Online` (16h, 12px muted); edit pencil 24×24 right.
  - info rows 28h, 90px muted label column, value at +98px:
    `Email` (mailto link) · `Local time` (12:02 PM) · `Joined`
    ("1 year, 4 months ago") · `Teams` (radius-4 chips: 14px team mark +
    name, links).
  - stats: pill TAB row `Labels|Priority|Projects|Teams` (92–101×28
    @y433) with per-value count rows below (counts right-aligned at
    x1385, ~43px pitch).

## Not measured

- The three header buttons' glyphs/labels and their popovers.
- Card paddings/radius px (built from board-family tokens).
- The stats rows' exact bar/graph treatment (count column captured;
  any bar fill not yet).
- `Local time` needs a timezone plane — feature-gated in ours (named).
- `⋅ Online` presence and the edit pencil — planes absent, gated.
- Offline vs Online presence dot; light theme.
- Created tab contents (assumed same board scoped to creator).
