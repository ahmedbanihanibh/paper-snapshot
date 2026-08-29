# Issues — detail page, inbox, board layout, filter value search, empty state

Tier-2/3 sweep. Dark theme, 1432 × 723, DPR 2. Frames in
`bundles/issues-dx` (015-*, 016, 017), all imported to Paper at true size with
verified ground (#09090A).

## Issue detail page (TES-51, `015-issue-detail-page`)

| | |
|---|---|
| main column | x 253, **width 622** |
| properties sidebar | x 1003, **width 374**, background transparent (page ground shows) |
| title | contenteditable DIV, **24px / 38.4 (1.6) / 600**, `lch(100 0 272)`, placeholder "Issue title" |
| description | contenteditable DIV, placeholder "Issue description" |
| property rows | all buttons **28px tall**: Status · Priority · Assignee · **Agent ("Cursor")** · Add to cycle · Add label · Project |

The sidebar has NO left border and no own background — it sits on the page
ground. The **Agent row** ("Cursor" in this workspace) is a first-class
property row beside Assignee — more evidence for our assign-to-Protocolbase
being a property, not a bolt-on.

### Activity timeline + comment composer (measured on TES-52)

| | |
|---|---|
| "Activity" header | 15px/600 `lch(100 0 272)` at x305 |
| timeline row | h28, avatar chip + sentence; actor names are 12px/**500** `lch(61.803 1.2 272)` inline links; `·30d ago` timestamp trails |
| row pitch | ~29px (177 → 206) |
| comment composer | `<form>` **665×83** card: bg `lch(9.232 0.85 272)` (same token as board card), radius 8, shadow `0 0.5px 1px 1px lch(0 0 0 / 0.3)` |
| composer input row | 632×26 inset (17px left pad) |
| submit button | **24×24 circle** (radius 12), bg `lch(13.861 1.139 272)`, right-aligned, aria "Submit comment"; header also has an "Add comment" icon action |

Agent-delegation writes into the SAME timeline ("Ahmed Banihani delegated to
Cursor and self-assigned the issue") — agent activity is ordinary activity.

### Detail-route overlays (crawled; Paper 025–030, verified true-size)

| trigger | frame · size | contents |
|---|---|---|
| ⋯ Issue options | `026` 225×521 | filter input + `Team ⌘⇧M ▶` · `Due date ⇧D ▶` · `Add link ^L` · Add pull request · Add document · Create related ▶ · Mark as ▶ · Copy ▶ · Convert to ▶ · `Remove from favorites ⌥F` · `Remind me ⇧H ▶` · **Run loop on TES-52…** · Show description history · `Delete ⌘⌫` — a SUBSET+extension of the row context menu, with a filter box at top |
| "Work on issue" header action | `027` 209×611 | `Work on issue… W,O` · **`Copy as prompt ⌘⌥P`** · Open in <the full 15-agent roster with digits> · Configure coding tools… |
| Agent property row ("Cursor") | `030` 175×109 | **"Delegate to…"** picker: No agent⁰ · Cursor · Linear — the assign-to-agent primitive |
| status property row | `028` 207×274 | 7-state picker (207 token) |
| Add label row | `029` 207×232 | label multi-select (207 token) |
| favorites star | `025` 220×695 | sidebar favorites reveal |

`030` is THE spec for our assign-to-Protocolbase picker (P6): a dedicated
"Delegate to…" scope-headed picker on the Agent property row, distinct from
Assignee.

## Inbox (`015-inbox-two-pane`)

Two-pane split captured populated (seed notifications). Numeric anatomy (dark):

| | |
|---|---|
| panes | sidebar 244 · list pane x244 **w399** · detail pane x644 **w779** |
| row | `<a>` **399×55**; inner content inset 8px, radius 8px |
| selected wash | `lch(15.42 1.3 272)` (+ `rgba(255,255,255,0.075)` hover stack on top) |
| avatar | 32×32, radius 50%, at x260 (16px from pane edge), vertically centered |
| line 1 (y+11) | ID 13px/450 `lch(91.269 1.425 272)` · title 13px/**500** same color, 5px gap |
| line 2 (y+30) | actor ("Cursor") 12px/450 `lch(65.078 1.425 272)` · time ("30d") right-aligned at x605, same style |

No Today/Earlier group headers at this volume — the list renders FLAT until
grouping is warranted (unverified threshold). Read/unread: rows here were all
read; unread-dot treatment not observed with this fixture.

### Inbox overlays (walked)

| trigger | surface | contents |
|---|---|---|
| row right-click | context menu **232×229** | `Mark as unread U` · `Delete notification ⌫` · `Snooze H ▶` · `Unfavorite ⌥F` · Copy ▶ · `Open in desktop app ^⌘,` |
| "Notification actions" (toolbar ⋯, x305) | 356×109 | Delete all · `Delete all read ⇧⌫` · Delete all read for completed issues and reviews |
| Add filter (x574) | **207×273** property list | Notification type · From · Team · Project · Initiative · Issue priority · Issue status type — all ▶, same 207 width token |
| Display options (x608) | 301×161 | Ordering: Newest · Show snoozed · Show read · Show unread first toggles |

Inbox row hover reveals NO inline action buttons (unlike issue rows) — actions
live in the context menu + toolbar only. The notification context menu is its
OWN vocabulary (unread/snooze/delete-notification), not the issue context menu.

## Board layout (`015-board-layout-my-issues-created`)

/my-issues/created renders Board (Columns: Status) with all seeded issues as
cards. Numeric anatomy (dark):

| | |
|---|---|
| column | **348px pitch**, adjacent (no outer gap — inner padding makes the gutter); header h50 with `<Status> <count>` |
| card | **322 wide** (13px column inset each side), height fits content (132 with 2-line title), `lch(9.232 0.85 272)` bg, radius 8 |
| card shadow | `0 0 0 0.5px lch(100 0 0 / 0.083), 0 0.5px 1px 1px lch(0 0 0 / 0.3)` — hairline ring + soft drop |
| card gap | **8px** vertical |
| card layout | ID 12px/450 top-left (12px inset) · status icon 12×12 second row left · title 13px/500 beside it, wraps (w≈248) · assignee avatar top-right |

## Filter value search — values carry LIVE COUNTS (`016`)

Typing into the filter menu (`f` → "status") flattens the property list into a
cross-property **value** search. Each value row shows a live issue count:

> Status Todo **6 issues** · Done **26** · Backlog **16** · Canceled **1** ·
> Duplicate *(no count = 0)* · In Review *(0)* · In Progress **4** ·
> Dates "Time in current status" presets each with counts ·
> Project-status values · AI filter escape hatch last

Zero-count values render WITHOUT a count rather than "0 issues". Selecting a
value applies the filter chip directly — no operator step for the default
(`is`) case.

### Filter chip anatomy + operators (measured)

Applied chip is a **three-segment pill** in the filter bar (y 107, h 24):
`[icon+Property][operator][value]` — e.g. `Status | is | Todo` at x 263,
segments 64+22+57 wide. Right side of the bar gets `Clear` + `Save` (h 24).

Each segment is independently clickable:

| segment | opens | contents |
|---|---|---|
| property/value | value picker, 204×285 under the value segment | "Showing all items" header + all values with LIVE counts; multi-select toggles |
| operator | operator menu, **175×77** (both types) | enum-type single value: `is` / `is not` · enum multi-value: **`is any of`** / `is not` · date-type: `before` / `after` (default **after**) |

**The operator auto-flips `is` → `is any of` when a second value is toggled**,
and the value segment collapses to a count ("2 statuses"). Operator vocabulary
is tiny and typed — enum {is, is not, is any of}, date {before, after} — no
free-form operator builder. Date filters enter through a **flattened preset
list with live counts** (`f` → "created" → "1 day ago 10 issues · … · 1 year
ago 53 issues · Custom date or timeframe…"); selecting a preset applies
`Created date after <preset>` directly.

Trap: after `f`, the palette's first row is AUTO-SELECTED — press Enter
directly; an ArrowDown first skips to the second row (cost one blind run).

## First-run empty states (`023`, `024`) — MEASURED, with per-view SVGs

Created team **EMP** ("Empty Fixture") for ground truth. Anatomy is one shared
template, content varies per view:

> centered block, **340px wide**, ~284–293 tall · illustration svg (~86×80,
> DIFFERENT drawing per view) · heading (view name) · 2-sentence explainer ·
> ghost CTA **`Create new issue  C`** (with keyboard hint chip)

| view | block | copy opener |
|---|---|---|
| /team/EMP/all (`024`, node 18T7-0) | 340×284 at (664,249) | "All issues is the place where you can see all your team's work…" |
| /team/EMP/backlog | 340×293 | "The backlog is a place for new issues and ideas that haven't been prioritized…" |
| /team/EMP/active | 340×284 | "Active issues represent work that is currently in flight…" |
| /team/TES/cycle/3 (`023`, node 18DP-0) | 340×275 at (444,253) | "Cycles are time-based intervals…" — no CTA; right Planning panel (419×93: Capacity 0% · Days to start 28 · Scope 0) |

Extracted SVGs (never redraw): `assets/linear-icons/
empty-{emp-all,emp-backlog,emp-active}-illustration.svg` +
`empty-cycle-illustration.svg` (123×108 viewBox, fills/strokes in `lch()` —
theme-aware vector, not a raster).

Each view teaches its own concept in the empty state — the empty state IS the
onboarding for that view's semantic. Ours must do the same per container kind
(version list / project list / promoted-from-validation list).

## Empty state — filtered to zero (`017`)

Applying Status=Duplicate on a view with no duplicates:
**"No issues matching the filters"** centered text; toolbar keeps the filter
chip with a **Clear all filters** affordance (aria-label measured — clicking it
restored 42 rows). The true first-run empty state (no issues at all, with
illustration SVG) is NOT this state and still owed — the workspace is
deliberately populated now.

## Pipeline traps fixed this pass (in spec-crawler source)

1. `capture_state` now records `rect` (mcp.mjs) — artboards were importing at
   the 800×600 fallback.
2. `normalizeFrameRoot` demotes a `<body>` root to `<div>` (src/paper.mjs) —
   Paper's write_html drops ALL inline styles on `<body>`, which erased the
   page ground and rendered the sidebar over white.
3. Paper's lch() parsing is CORRECT (probed: `lch(2.595% 0.4 272)` → #09090A);
   suspect the serializer/import chain, not the colour math.
4. **Bundle ids collide across `browser_attach` calls** (counter resets; three
   states got id 015 and two fell out of the manifest — recovered from disk).
   Until fixed: `bundle_write` + verify state count after every attach.

## Not measured

- Inbox read/unread-dot treatment; grouping threshold for Today/Earlier headers.
- Board column drag + card cross-column drag.
- Detail page: sub-issues affordance, prev/next navigation.
