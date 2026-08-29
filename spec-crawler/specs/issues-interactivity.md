# Issues — interactivity: accelerators, mutations, optimistic timing, bulk, context menu

The seed + interactivity pass. Workspace now contains 10 seeded issues
(TES-64…TES-73 range; identified below) created through the real `c` dialog —
title via `Input.insertText`, submit via ⌘Enter. All property changes below were
applied through the real UI, so the workspace doubles as the populated fixture
for later frame captures.

Dark theme, viewport 1432 × 723, raw CDP.

---

## 1 · The eight accelerators are PALETTE RECIPES, not dropdowns

Pressing `S` / `P` / `A` / `L` on a row does not open a small anchored menu. It
opens **the command palette surface** (same 708px-wide floating surface at the
same anchored position, ~(362,134)) pre-scoped to that mutation:

| key | placeholder | items (this workspace) |
|---|---|---|
| `S` | `Change status…` | 7 — Backlog · Todo · In Progress · In Review · Done · Canceled · **Duplicate** |
| `P` | `Set priority to…` | 5 — No priority · Urgent · High · Medium · Low |
| `A` | `Assign to…` | 5 (members + no-assignee) |
| `L` | `Add labels…` | 4 (Bug · Feature · Improvement · +create) |

Each shows the **context line** `TES-65 ⋅ Add SNMP walk caching layer…` above
the input — the same context-target mechanism as ⌘K (see issues-list-surface.md
C8). Type-to-filter works; `Enter` applies and closes.

**Duplicate is a seventh STATUS**, not only a relation kind. Our `workStates`
seed and the status icon set must include it.

**The context target follows the hovered row** (`data-active`), not only the
keyboard cursor: all captures above were driven by hovering with a real pointer
move and pressing the accelerator — no `j`/`k` involved. Hover-then-key is a
first-class interaction path.

## 2 · Optimistic mutation — measured, the baseline for our speed claim

Setup: `/team/TES/all`, grouped by status, target row visible in the same
window as its destination group. MutationObserver on the list +
PerformanceObserver on `graphql` resources, t0 stamped at the `Enter` that
applies "In Progress" in the `S` palette.

| event | t after Enter |
|---|---|
| target row leaves its old group's DOM position | **35 ms** |
| group header counts update (3→4, 19→18) | **35 ms** |
| first GraphQL response completes | **347 ms** |

**Linear applies the mutation optimistically ~312 ms before the network
settles.** The regroup is DOM-complete at ~35 ms (roughly two frames — palette
close + list re-render in one commit). No skeleton, no pending row state.

For protocolbase: a Zero `typedMutate` write is synchronous to IDB, so our
equivalent regroup should land ≤16 ms (one frame). The measurable claim is
therefore "regroup in one frame vs ~two frames" (modest) — the *structural*
win remains scope-switching with zero network (Linear re-fetches per route;
we filter warm IDB). Both numbers now have a measured baseline.

## 3 · Bulk selection at n=3 — geometry invariant confirmed

`x` on hover row, `j`+`x` ×2 → "3 selected".

- Bar rect **707.1 × 626.5, 253.8 × 44** — identical at n=1 (round 2) and n=3:
  invariant confirmed at a third count.
- bg `lch(9.232 0.85 272)`, radius 9999px, 3-layer shadow
  (`lch(0 0 0/.125) 0 3px 8px · 0 2px 5px · 0 1px 1px`).
- Buttons: **Actions** (84px, filled `lch(13.861 1.139 272)`, radius 9999),
  **Ask Linear** (28px, filled), **Clear selected** ✕ (28px, transparent ghost).

**The Actions button opens the palette surface** (708px, `Type a command or
search…`) with the bulk command set — the round-1 inference is now measured.
18 items, all with accelerators:

> Assign to… `A` · Assign to me `I` · Change status… `S` · Change priority… `P` ·
> Add to project… `⇧P` · Change or add labels… `L` · Add to cycle… `⇧C` ·
> Set due date… `⇧D` · Copy issue IDs `⌘.` · Copy issue URLs `⌘⇧,` ·
> Copy issue titles `⌘⇧'` · Copy titles as links `⌘C` ·
> Copy issue descriptions as Markdown · Copy issue content as Markdown `⌘⌥C` ·
> Copy git branch name `⌘⇧.` · Unsubscribe from issue `⇧S` ·
> Change subscribers… `⌘⇧S` · Remove all subscribers

Note the bulk set is the scoped single-issue set minus the singletons (rename,
convert, delete is absent here) and pluralised copy commands.

## 4 · Row context menu (right-click) — first capture

192 × 681 at (648, 32); **the shared floating surface** (`lch(12.72 0.85 272)`,
radius 12px). 19 items:

> Status `S` ▶ · Priority `P` ▶ · Assignee `A` ▶ · Due date `⇧D` ▶ ·
> Labels `L` ▶ · Project `⇧P` ▶ · Cycle `⇧C` ▶ · More properties ▶ ·
> ─ Create related ▶ · Mark as ▶ · Remove ▶ · Copy ▶ · Convert to ▶ · Move ▶ ·
> Open in ▶ · ─ **Run loop on TES-58…** · Favorite `⌥F` · Remind me `⇧H` ▶ ·
> Delete `⌘⌫`

- The seven property rows carry the SAME single-key accelerators as the
  palette recipes — three routes to one mutation (accelerator, context menu,
  palette), all converging on the same property set. This is the DX pattern to
  clone: **one mutable-property contract, three entry surfaces.**
- `Run loop on TES-58…` is Linear's agent dispatch from the context menu — the
  direct analogue of our "assign to Protocolbase" and evidence the pattern
  belongs in the context menu, not only the assignee picker.
- Submenus (▶): full walk below (§4b).

### 4b · ALL context-menu submenus, walked (hover ~850ms each)

Paper frame `022-context-menu-status-submenu-open` (node 17E4-0) shows the
Status submenu open. Submenus anchor at **x 838** (menu right edge 840 − 2px
overlap) and vertically align to their parent row. All are the shared floating
surface. Widths vary per content. Contents (this workspace):

| parent | size | rows |
|---|---|---|
| Status | 175×273 | "Showing all items" scope header · 7 states each with **count badge + accelerator digit 1–7** (Backlog¹ Todo² In Progress³ In Review⁴ Done⁵ Canceled⁶ Duplicate⁷) |
| Priority | 175×209 | scope header · No priority⁰ · Urgent¹ High² Medium³ Low⁴ |
| Assignee | 178×269 | scope header · No assignee⁰ · members (avatar) · **"Other agents" section: Cursor** · New user · `Invite and assign…` |
| Due date | 246×241 | `Custom…` · Tomorrow · End of this week · In one week · End of this cycle · End of next cycle — each with resolved date right-aligned |
| Labels | 175×177 | scope header · label rows (color dot) — multi-apply |
| Project | 383×269 | No project⁰ · "Projects in <team> team" section · projects (icon) · `Create new project…` |
| Cycle | 294×177 | No cycle⁰ · cycles with date range + `・Current`/`・Upcoming` suffix |
| More properties | 175×153 | `Add link… ^L` · Add pull request… · Add document… · `Rename… ⇧R` |
| Create related | 176×173 | Issue… · `Sub-issue… ⌘⇧O` · Parent issue… · Blocked issue… · Blocking issue… |
| Mark as | 200×205 | Parent of… · `Sub-issue of… ⌘⇧P` · `Related to… M,R` · `Blocked by… M,B` · `Blocking… M,X` · `Duplicate of… M,M` — **chorded accelerators ("M, then R")** |
| Remove | 383×45 | **DYNAMIC** — lists the issue's actual removable relations, e.g. `Related issue TES-36 <project>` (measured on TES-28); absent entirely when nothing is removable |
| Copy | 271×313 | `Copy ID ⌘.` · `Copy URL ⌘⇧,` · `Copy title ⌘⇧'` · `Copy title as link ⌘C` · Copy description as Markdown · `Copy content as Markdown ⌘⌥C` · `Copy git branch name ⌘⇧.` · **`Copy as prompt ⌘⌥P`** · Make a copy… |
| Convert to | 175×109 | Project… · Template… · Recurring issue… |
| Move | 200×141 | `Move to top ⌥⇧↑` · `Move up ⌥↑` · `Move down ⌥↓` · `Move to bottom ⌥⇧↓` (manual-order ops) |
| Open in | 209×569 | `Desktop app ^⌘,` · **coding-agent roster with digit accelerators**: Amp¹ Claude Code² Codex CLI³ Codex desktop⁴ Cursor⁵ Custom script⁶ GitHub Copilot⁷ Lovable⁸ Netlify⁹ OpenCode Replit v0 Warp Windsurf Zed (some with own ▶) · `Configure coding tools…` |
| Remind me | 304×241 | An hour from now · Tomorrow 9:00 · Next week Mon 9:00 · A month from now · Next cycle · Custom… — resolved datetime right-aligned |

**The menu is STATE-CONDITIONAL.** Same route, different rows produced
different item sets: an issue with no relations/subscriptions showed
`Unsubscribe ⇧S` and NO `Remove ▶`; TES-28 (has a related issue) showed
`Remove ▶`. Item list = f(issue state) — build ours the same way, never a
static menu.

- Property submenus repeat the palette-recipe content EXACTLY (same counts,
  same digit accelerators) — third confirmation of one-contract/three-surfaces.
- **`Copy as prompt`** and the **`Open in` coding-agent roster** are Linear's
  agent-handoff DX — direct spec for our MCP/agent-gateway integration (P6).
- Detection trap: the context menu has **NO `role="menu"`** — locate it by
  sweeping `position:fixed` elements (150<w<400, h>300); submenus are new
  fixed elements outside the parent menu.
- Opening trap: menu items live at fixed heights 24–40px; right-click must
  land on a row BELOW the sticky toolbar (y>150) or nothing opens.

## 4c · Inline row-pill editing — the FOURTH entry surface

Row icons ARE click targets, each opening an **anchored picker, 207px wide**
(height fits content) directly under the icon — NOT the 708px palette:

| target | in-row geometry | picker | content |
|---|---|---|---|
| priority icon | 16×16 at x287 | 207×209 below icon | same 5 rows + digit accelerators as `P` recipe |
| status icon | 14×14 at x370 | 207×273 below icon | same 7 states + digits as `S` recipe |
| assignee avatar | 18×18 at x1312 (right rail) | 207×269, **right-aligned** to stay in viewport | same as `A` recipe incl. "Other agents: Cursor" + Invite |
| cycle pill | 14×14 svg at x1270 | — | **NAVIGATES** to `/team/TES/cycle/1` (it's a link, not a picker) |
| created-date span | x1361 | — | not a target; click falls through to row → detail page |
| select checkbox | 14×22 at x261 | — | toggles selection, no overlay |

All pickers repeat the SAME rows/accelerators/scope-header as the palette
recipes and context-menu submenus — the one-contract now has **four entry
surfaces**: accelerator key → palette recipe · right-click submenu · bulk
Actions palette · inline anchored icon picker. Anchored pickers share the
width token (207) while the palette recipe is 708 — two surface sizes, one
contract.

## 5 · Seeded fixture state (for later captures)

| issue | status | priority |
|---|---|---|
| Add SNMP walk caching layer… (TES-65) | In Progress | Urgent |
| Param 1001 shows stale value… | In Review* | High |
| Table column widths reset… | Todo | Medium |
| QAction compile diagnostics… | Todo | High |
| Add dark-mode support to XML viewer | Backlog | Low |
| deliberately very long title… | Backlog | none |
| Write onboarding doc for protocol branches | Todo | none |
| Investigate flaky trap replay… | In Progress (via the timing test) | Medium |
| Ship version bump carry-over policy | **Done** | none |
| Spike: Rust engine serial I/O parity | **Canceled** | none |

*the final `review` change reported ROW NOT FOUND once — verify Param 1001's
status before relying on it. Labels applied later via the `L` recipe and
VERIFIED on rows: **TES-66 Bug · TES-65 Feature · TES-28 Improvement**.
TES-70 is now Todo (board-drag test, §6). Assignee application still not done.

## 6 · Board drag (cross-column) — measured mid-flight

Dragged TES-70 Backlog→Todo on /my-issues/created (board). CDP: press →
8 stepped moves (60ms apart) → release. All three drag layers measured
mid-drag:

| layer | value |
|---|---|
| dragged card | the ORIGINAL element, moved via `transform: translate()` (no clone, no shadow change, opacity 1) |
| drop slot | inset placeholder **304×120** in the target column (20px narrower than the card), bg `lch(9.345 0.85 272)`, border `0.5px solid lch(18.48 1.48 272)` |
| column headers | dimmed by a `lch(2.595 0.4 272 / 0.4)` scrim (340×46 over each header) while dragging |

Drop = real status mutation (card re-parents to Todo instantly). List-surface
manual reorder is keyboard-first via the Move submenu (`⌥↑`/`⌥↓`/`⌥⇧↑`/`⌥⇧↓`,
§4b); pointer reorder on the list needs Ordering: Manual — not driven.

**Fixture drift:** TES-70 is now **Todo** (was Backlog) as of this test.

## Traps added this pass

- **Virtualized rows are not in DOM** — text search finds nothing below the
  fold. Scroll-sweep the list scroller first; `hoverRow` must re-read the rect
  after `scrollIntoView` settles.
- **Escape walks UP THE BREADCRUMB from the list surface** (list → team
  Overview) — round 2's cycle-route observation generalises to the team route.
  Stray Escapes navigate; verify `location.pathname` after every Escape.
- cmdk surfaces ignore synthetic `.click()` — keyboard (`ArrowDown`/`Enter`) or
  real `Input.dispatchMouseEvent` only (from color-tokens-light.md, held here).

## Not measured

- List-surface pointer reorder (needs Ordering: Manual) — board drag + Move
  submenu cover the pattern; see §6.
- Label application to fixture issues (see fixture table).
- The `Run loop` flow — do not run it; it invokes Linear's agent on real data.
- Bulk bar at n crossing groups' selected-run radius — data attrs verified in
  round 2, the visual at n=3 not captured as a frame yet.
- Whether the optimistic 35 ms includes an animation (motion capture not run —
  filmstrip the regroup in a later pass).

## Icon set — now complete

`assets/linear-icons/` (112+ files): all **7 status** icons labelled
(`status-{backlog,todo,in-progress,in-review,done,canceled,duplicate}.svg`,
extracted from the S palette's own rows) and all **5 priority** icons
(`priority-{no-priority,urgent,high,medium,low}.svg`), plus sidebar/nav/
toolbar/close/caret sets with a context `_index.json`. Nothing redrawn.
