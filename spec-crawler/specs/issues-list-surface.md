# Issues — list surface, toolbar, selection, command layer

Answers MEASURE round 1, parts B and C. Reference
`https://linear.app/test-workspace-bb/my-issues/assigned`, List layout,
Grouping = Status.

Normalised viewport: **1432 × 723 CSS px, DPR 2**. List content column spans
x 244.5 → 1423.5 (width 1179).

---

## B4 · The issue row and its states

Row geometry, identical in every state:

| | |
|---|---|
| rect | x 244.5, width 1179, **height 44** |
| pitch | 44px — rows butt, no gap, no divider |
| border-radius | 8px |
| own `background-color` | `rgba(0,0,0,0)` **in every state** |
| element | `a._gridRowShared` → `/{workspace}/issue/TES-59/{slug}` |

### The state model is attribute-driven, not `:hover`

A CSS-state scan will find almost nothing here. Linear drives row state through
data attributes on the `<a>` and paints through `::before`:

| attribute | meaning | set by |
|---|---|---|
| `data-active` | this row is the pointer/cursor target | pointer hover **or** keyboard cursor |
| `data-apply-background` | paint the wash | tracks `data-active` |
| `data-keyboard-active` | this row holds the **keyboard cursor** | `j` / `ArrowDown` / `k` / `ArrowUp` |
| `data-selected` | member of the multi-selection | checkbox click, `x` |
| `data-first-selected` / `data-last-selected` | edges of a contiguous selected run | derived |
| `data-first-in-group` / `data-last-in-group` | edges of the status group | derived |

The last four exist so the 8px radius can be applied to the ends of a run rather
than to every row. Build the same four flags or grouped selection corners will
be wrong.

`data-active` and `data-keyboard-active` are **independent**. Hovering row B
while the cursor sits on row A gives B `data-active=true, data-keyboard-active=false`
and A `data-active=false, data-keyboard-active=true`.

### Washes, all painted on `a::before`

| state | `::before` background |
|---|---|
| rest | none |
| hover / cursor (`data-apply-background=true`) | `lch(9.345 0.85 272)` |
| selected (`data-selected=true`) | `lch(15.966 18.242 286.445)` |

Selection leaves the neutral ramp — hue **286.4** with chroma 18.2, the accent
family (the Display panel's toggle knob is `lch(47.918 59.303 288.421)`). Hover
stays on the neutral hue 272 at chroma 0.85. Do not implement selection as "a
darker hover".

### Group-hover-revealed vs always present

Only **one** affordance is revealed: the **selection checkbox**.

| | |
|---|---|
| slot | x 260.5, width 18, height 22 — 16px in from the row's left edge |
| control | `<input>` 12 × 12, centred in a 14 × 14 box at x 263.5 |
| revealed by | the row's own `data-active` |

Everything else — priority icon, issue ID, title, labels, project pill, status
pill, avatar, date — is always present. When the checkbox appears the rest of the
row does **not** shift; the 18px slot is reserved at rest.

### The trap that made the first reading wrong

`data-active` is **not cleared when the pointer leaves the row**. It is cleared
when the pointer leaves the **list container**. Measured:

| pointer at | result |
|---|---|
| (700, 150) — over TES-59 | TES-59 `active=true` |
| (700, 620) — empty space *below the last row, inside the list* | TES-59 **still** `active=true` |
| (120, 650) — sidebar | cleared |
| (700, 60) — view header | cleared |

A rest-vs-hover diff whose "rest" position is anywhere inside the list body
returns *no difference* and reads as "rows have no hover state". Park the pointer
in the sidebar before any rest capture.

---

## B5 · The status group header row

| | |
|---|---|
| sticky wrapper | x 244.5, width 1179, **height 36**, `position: sticky; top: -0.5px; z-index: 2` |
| painted bar | x 252.5, width 1163, height 36 — inset **8px** from the content column on the left, `padding-right: 8px` |
| bar background | `lch(9.232 0.85 272)` |
| status label | 13px / 500, `lch(90.826 1.425 272)`, left edge x 312.5 |
| count | 13px / **450**, `lch(63.304 7 270.292)`, left edge x 370.4 — 8px after the label |
| collapse caret | far left of the bar, ~x 262, revealed on hover |
| status icon | between caret and label, ~x 288 |
| trailing `+` | right end of the bar — "add issue to this group" |

Two things worth copying exactly: the header bar is **inset 8px** from the rows
it heads (rows start at 244.5, bar at 252.5), and the count uses weight **450**,
not 500 — a distinct optical weight for the numeral.

The count colour is hue **270.292**, not 272. It is the only value in this
capture that leaves the hue-272 neutral ramp without being an accent. Treat it
as a deliberate token, not as noise, but flag it if you build a strict
"all neutrals are 272" lint.

### What the count counts

**Issues visible in that group after filters and display options** — not the
group's true size. On `/my-issues/assigned` the header reads `Backlog 2` while
the footer reads `4 issues hidden by display options`; in Board layout the same
state showed `Backlog 2 · Todo 0 · In Progress 0 · Done 0` with the same 4
hidden. The 4 completed issues are excluded by `Completed issues: Past day` and
appear in no count.

---

## B6 · Toolbar — Filter and Display

Both open as **portals with no ARIA role** — no `role="dialog"`, no
`role="menu"`, no `data-radix-*`. Anything keyed on those selectors finds
nothing.

### Shared surface primitive

The command palette and the filter menu use the same surface:

| | |
|---|---|
| background | `lch(12.72 0.85 272)` |
| border-radius | 12px |
| border | `0.5px solid lch(25.68 1.93 272)` |
| shadow | `lch(0 0 0 /.1) 0 4px 40px`, `lch(0 0 0 /.125) 0 3px 20px`, `lch(0 0 0 /.125) 0 3px 1…` |

### Filter menu — the filterable property set

Opens with `f` or the filter button. Surface 207 × 610 at (1214, 92). Item
height 32, font 13px. Content overflows (client 573, scroll 796).

Header: `Showing all items`, with the `F` accelerator shown on the right.

1. AI filter *(free-text)*
2. Advanced filter
--- 
3. Status ▶ · 4. Assignee ▶ · 5. Agent ▶ · 6. Agent Session ▶ · 7. Creator ▶ ·
8. Priority ▶ · 9. Labels ▶ · 10. Relations ▶ · 11. Suggested label ▶ ·
12. Dates ▶
---
13. Project ▶ · 14. Project properties ▶ · 15. Initiative ▶ · 16. Cycle ▶ ·
17. Added to cycle ▶
---
18. Subscribers ▶ · 19. External source ▶ · 20. Auto-closed *(no submenu)* ·
21. Content ▶ · 22. Links ▶ · 23. Template ▶

`Auto-closed` is the only leaf — every other property opens a value submenu.

**This list is identical on `/my-issues/assigned` and `/team/TES/all`.** See
`issues-scope-model.md` A2 for why that matters.

### Display panel — the groupable property set

Opens with the Display button. Surface 301 × 502 (Board) / 301 × 438 (List) at
(1080.5, 92.5). Content column x 1097, width 268 → **16px padding**. Control
rows are 32px; section labels 14.5px; three blocks separated by dividers.

**Groupable** (the `Grouping` / `Columns` / `Rows` dropdown, 24px items):

> No grouping · Focus · **Status** · Agent · **Project** · **Priority** ·
> **Cycle** · **Label** · **Team**

Nine options. Compare against the 22 filterable properties: grouping is a small
curated subset plus two things that are *not* filterable — **Focus** and
**Team**. Assignee and Creator are filterable but **not** groupable here.

Panel contents by layout:

| | List | Board |
|---|---|---|
| axes | `Grouping`, then `Sub-grouping` once Grouping ≠ No grouping | `Columns` and `Rows`, both always shown |
| Ordering | ✓ | ✓ |
| Order completed by recency | ✓ | ✓ |
| Completed issues | ✓ | ✓ |
| Show sub-issues | ✓ | ✓ |
| layout block | **List options** → Nested sub-issues, Show empty groups | **Board options** → Show empty columns |

**Display properties** — 14 toggle pills, 4 per row, ordered:
ID · Status · Assignee · Priority / Project · Due date · Milestone · Cycle /
Labels · Links · Time in status / Created · Updated · Pull requests

| pill state | background | colour |
|---|---|---|
| on | `lch(25.834 1.525 272)` | `lch(100 0 272)` |
| off | `lch(17.349 1.043 272)` | `lch(64.714 1.425 272)` |

Pill height 24, `border-radius: 9999px`, 12px / 500, 5px horizontal gap, 29px
row pitch. Toggle switches are 22 × 14, `border-radius: 72px`, on-state
`lch(47.918 59.303 288.421)`.

---

## C7 · Multi-select and the bulk action bar

### How selection is entered — three routes, measured

| route | effect |
|---|---|
| click the hover-revealed checkbox | `data-selected=true` on that row |
| `x` on the keyboard-cursor row | `data-selected=true`, cursor unchanged |
| `j` / `k` / `ArrowDown` / `ArrowUp` | moves the cursor only — **does not select** |

Cursor and selection are separate. `x` acts on the cursor row, so a
keyboard-only user moves with `j`/`k` and marks with `x`.

### The bar

Appears the moment the first row is selected.

| | |
|---|---|
| rect | x 707.1, y 626.5, **253.8 × 44** |
| position | horizontally centred in the list column (centre 834 = 244.5 + 1179/2) ✓ |
| background | `lch(9.232 0.85 272)` — same token as the group-header bar |
| border-radius | **9999px** (full pill) |
| padding / gap | 8px / 8px |
| shadow | `lch(0 0 0 /.125) 0 3px 8px`, `… 0 2px 5px`, `… 0 3px 1…` |

Contents, left to right:

1. **"1 selected"** count label
2. **Actions** button — x 796.5, 84.4 × 28, `bg lch(13.861 1.139 272)`,
   `radius 9999px`, 12px / 500, `color lch(90.826 1.425 272)`, prefixed with a
   ⌘ glyph. Opens the same command set as ⌘K.
3. **Ask Linear** icon button — x 888.9, 28 × 28, same filled treatment
4. **Clear selected** ✕ — x 924.9, 28 × 28, **transparent background** (ghost
   variant, the only unfilled control in the bar)

---

## C8 · The command layer

Surface 720 × 450 at (356, 94) — anchored to the view, not the viewport centre.
Item height 46, section-header height 30, item font 15px. Content is long:
client 404 vs scroll 6264.

Header row carries the search input (`Type a command or search…`) and, right
aligned, an **`Ask Linear` / `Tab`** affordance — Tab hands the typed string to
the agent instead of the command matcher.

### What ⌘K scopes to — and what it does *not*

**It scopes to the keyboard cursor row, not to the selection.** Proven:

| state | palette context line |
|---|---|
| TES-59 selected | `TES-59 ⋅ Normalize button borders/variants…` |
| selection cleared with Escape, nothing selected | still `TES-59 ⋅ …` |
| full page reload, pointer parked in the sidebar, nothing touched | still `TES-59 ⋅ …` |
| cursor moved to TES-58 with `j` | `TES-58 ⋅ Generate and display thumbnails…` |

On load the list installs an implicit context target on the **first row**
(`data-active=true`, `data-keyboard-active=false`), so the palette is *never*
unscoped on an issue list. "⌘K scopes to the selection" is wrong and would have
been my answer without the cursor test.

### Structure

The scoped issue commands are **hoisted into an unlabelled first section** above
every labelled global section. Same palette, same list — the subject's commands
are prepended.

Scoped section, in order, with shortcuts:

> Assign to… `A` · Un-assign from me `I` · Change status… `S` ·
> Change priority… `P` · Move to project… `⇧P` · Change or add labels… `L` ·
> Add to cycle… `⇧C` · Set due date… `⇧D` · Copy issue ID `⌘.` ·
> Copy issue URL `⌘⇧,` · Copy issue title `⌘⇧'` · Copy title as link `⌘C` ·
> Copy issue description as Markdown · Copy as prompt `⌘⌥P` ·
> Remove all subscribers · Mark issue as… · Remove related… ·
> Show similar issues… · Favorite issue `⌥F` · Link pull request… ·
> Open issue link… · Add link… `⌃L` · Create new document… ·
> Remind me about this issue… `⇧H` · Issue description history ·
> Rename issue `⇧R` · Make a copy as new issue… · Convert to project… ·
> Convert into template… · Convert into recurring issue… ·
> Delete issue `⌘⌫`

Then the labelled global sections: **Issues** (Create new issue… `C`, Create
issue in fullscreen… `V`, Create new related issue…, Create new label…),
**Projects**, **Documents**, **Views**, **Initiatives**, **Team**, **Filter**
(Search workspace…, Find in view… `⌘F`, Add Filter… `F`), **Templates**,
**Favorites**, **Navigation** (Open pull requests… `O R`, Open issue… `O I`,
Open project… `O P`, Open cycle… `O C`, Go to inbox `G I`,
Go to my issues `G M`, Go to advanced search `/`, …).

The first eight scoped commands are exactly the eight issue properties with
single-key accelerators. That set — assignee, status, priority, project, labels,
cycle, due date — is the mutable property surface, and it is the shortlist worth
mirroring for a protocol version.

---

## How it was reached

- Raw CDP `Runtime.evaluate` / `Input.dispatchMouseEvent` /
  `Input.dispatchKeyEvent` over the target's WebSocket. No Playwright.
- Layout normalised to List and Grouping to Status through the real Display
  panel before any row measurement — the tab was in Board layout with the
  details panel open on arrival.
- Row states driven with real pointer moves and a 450ms settle, then read as a
  computed-style diff over the full row subtree (183 nodes) plus 2× clips of the
  same region. The screenshot pair is what caught the retained-hover trap; the
  style diff alone said "no change".
- Selection entered by clicking the actual checkbox at (269.5, 156) and,
  separately, by `x` on the cursor row; both verified through the row's data
  attributes rather than by appearance.
- Palette contents enumerated by scrolling its internal scroller in 0.8-viewport
  steps and de-duplicating by label.

## Not measured

- **The bulk bar's vertical anchor is a single-viewport reading.** y 626.5,
  bottom edge 52.5px above a 723px viewport. Linear positions other chrome in
  `vh` (the composer uses `13vh`/`6vh`), so 52.5px may be ~7.3vh and would move
  on a taller window. **Do not hard-code 52.5px** — ask for a second-height
  reading before you place it.
- **Only single selection was exercised.** Shift-click range, `⇧↓` range,
  select-all, and cross-group selection were not driven. The bar's count label
  was read as "1 selected" only, and `data-first-selected`/`data-last-selected`
  were inferred from a run of one, where both are trivially true. The grouped
  radius behaviour on a real multi-row run is unverified.
- **The Actions button was not clicked.** I state it opens the same command set
  as ⌘K from the ⌘ glyph and the "Actions" label; that is an inference, not a
  measurement.
- **The `Ask Linear` button and the `Tab` affordance were not activated.**
- **No submenu was opened from the filter menu.** The 22 property names are
  measured; the operators (is / is not / contains) and value pickers behind each
  ▶ are not. That is a large surface and probably its own round.
- **Board layout was measured only in passing.** Card geometry, column widths and
  column headers are not in this file.
- **No motion.** Wash transitions, palette enter/exit, and the bulk bar's
  appearance are uncaptured — `a._gridRowShared` declares `transition: color`
  only, which suggests the `::before` wash may be instant, but I did not film it.
  Run `verify-animation-parity.mjs` before copying any timing.
- **Row hover was measured on a two-row list.** Virtualisation behaviour, and
  whether `data-active` survives a scroll that recycles the row, are untested.
- Empty state, loading state, and the "N issues hidden by display options"
  footer were observed but not measured.

## Worth importing into the Paper file

Flagging for `app.paper.design/file/01KZM8W6RMDESESRWQM3VT1NKN/4-0`, in
dependency order — these are the primitives everything else is assembled from:

1. **Issue row**, all four states (rest / hover / selected / cursor) — the
   whole surface is this row repeated.
2. **Status group header**, expanded and collapsed.
3. **Floating surface**: `lch(12.72 0.85 272)` / 12px / 0.5px
   `lch(25.68 1.93 272)` / 3-layer shadow — one primitive serving the palette
   and the filter menu.
4. **Pill control** at `radius: 9999px` in its three variants: display-property
   toggle (on/off), bulk-bar filled button, bulk-bar ghost button.
5. **Bulk action bar** assembled, at 1 selected.
6. **Command palette** with the scoped context line — the context line is the
   piece clones drop.
