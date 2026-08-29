# Issues — navigational and scoping model

Answers MEASURE round 1, part A. Reference workspace `test-workspace-bb`,
entry `https://linear.app/test-workspace-bb/my-issues/assigned`.

Normalised viewport for every number here: **1432 × 723 CSS px, DPR 2**, Edge on
the persistent `~/.spec-crawler-edge` profile. Screen is 1440 × 900 with
`availHeight` 807, so 723 is the maximum viewport this machine produces — a
different machine will not reproduce y-coordinates.

---

## A1 · Sidebar structure

### Visible row order (all 17, top to bottom)

| y | row | kind | href |
|---|---|---|---|
| 16 | workspace switcher + search + compose | header | — |
| 60.5 | My issues | L0 nav | `/my-issues/assigned` |
| 89.5 | Inbox | L0 nav | `/inbox` |
| 118.5 | Reviews | L0 nav | `/reviews` |
| 147.5 | Agent | L0 nav | `/agent` |
| 176.5 | Drafts | L0 nav | `/drafts` |
| 221.5 | **Workspace** | section header (collapsed ▶) | — |
| 258.5 | **Favorites** | section header (collapsed ▶) | — |
| 295.5 | **Your teams** | section header (expanded ▼) | — |
| 325.5 | Test workspace bb | L1 team | — (disclosure only) |
| 354.5 | Home | L2 team child | `/team/TES/overview` |
| 383.5 | Issues | L2 team child | `/team/TES/all` |
| 412.5 | Cycles | L2 team child | `/team/TES/cycles` |
| 441.5 | Current | L3 cycle child | `/team/TES/cycle/active` |
| 470.5 | Upcoming | L3 cycle child | `/team/TES/cycle/upcoming` |
| 499.5 | Projects | L2 team child | `/team/TES/projects/all` |
| 528.5 | Views | L2 team child | `/team/TES/views/issues` |
| 572.5 | **Try** | section header (collapsed ▶) | — |

Under the collapsed **Workspace** header (measured by expanding it): Views
`/views`, Initiatives `/initiatives/active`, Projects `/projects/all`, then a
"More" disclosure row.

### The permanent / nested split

- **Permanent top-level (L0)** — My issues, Inbox, Reviews, Agent, Drafts.
  Never nested, never under a section header, always present.
- **Section headers** — Workspace, Favorites, Your teams, Try. These are
  collapsible *groups*, not destinations: they have no href. Order is fixed in
  this workspace; Workspace always precedes Favorites precedes Your teams.
- **Nested under a team (L2)** — Home, Issues, Cycles, Projects, Views. This is
  the whole team-level surface set, and it repeats identically per team.
- **Nested under Cycles (L3)** — Current, Upcoming. Only Cycles has L3 children.

Nothing nests under a *project* in the sidebar. Projects is a leaf destination at
both workspace and team level.

### Indent ladder

Every row box is `x: 12, width: 220, height: 28` regardless of depth — the
indent lives entirely in the row's content, never in the box.

| level | icon left | label left | label type |
|---|---|---|---|
| section header | — | 21 | 12px / 500 |
| L0 workspace nav | 20 | 40 | 13px / 500 |
| L1 team | 21 | 42 | 13px / 500 |
| L2 team child | 37 | 57 | 13px / 500 |
| L3 cycle child | *none* | 57 | 13px / 500 |

L3 does **not** indent further. It reuses L2's text column and drops the icon,
substituting a vertical guide line at x ≈ 44.5 running the height of the L3 run.
Nav icons are 14 × 14; section-header disclosure carets are 16 × 16.

Row pitch is 29px (28px row + 1px). Section-header pitch is 37px. The gap
between the L0 block and the first section header is 45px.

Colours: active row label `lch(100 0 272)`, inactive `lch(60.621 1.2 272)`.
Font is `Inter Variable` throughout. Hue 272 holds.

### Disclosure behaviour

Section headers and the team row toggle a collapsed/expanded run. **Collapsed
children stay mounted in the DOM and still return non-zero
`getBoundingClientRect()`** — the collapsed Workspace children reported
y-coordinates interleaved with the visible Favorites and Your-teams headers.
Filter on `el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})` or
any DOM-order sidebar read will be wrong. `aria-expanded` on the section header
buttons did **not** track the visible state and cannot be trusted either.

---

## A2 · Is scope filter state or route identity?

**Route identity.** Three independent measurements say so.

**1. Distinct routes with distinct tab sets.** These are not one surface with a
pre-applied filter — they do not even share a tab bar.

| surface | route | tabs |
|---|---|---|
| My Issues | `/my-issues/assigned` | Assigned · Created · Subscribed · Activity |
| Team Issues | `/team/TES/all` | Active · Backlog · All issues · *(saved views appended)* |

The team tab bar carries a fourth tab `dadas`
(`/team/TES/view/dadas-0687b0c306ed`) — a saved custom view, appended to the
built-in tabs as a peer. Saved views are additional *routes* in the same bar,
not filter presets.

**2. The scope predicate is never expressed as a filter.** The filter menus on
`/my-issues/assigned` and `/team/TES/all` are **byte-identical** — same 22
properties in the same order. Neither offers an "Assignee = me" chip you could
remove on My Issues, and neither offers **Team** at all. Typing `team` into the
My Issues filter search returns `Showing 1 item` and matches only the free-text
`AI filter` escape hatch. The scope is baked into the route and is not
representable in the filter language.

**3. Team is a *display* dimension, not a filter dimension.** On the cross-team
My Issues surface, `Team` appears in the **grouping** list (see B6) while being
absent from the filter list. Linear's answer to "show me my work across teams"
is: route gives you the scope, grouping gives you the breakdown.

### What this means for org / project / version

Model the three protocolbase scopes as **three routes**, not one route with a
scope chip:

- the scope predicate is implicit in the route and is not user-removable;
- each scope gets its **own tab set** — do not force org, project and version to
  share tabs, Linear does not;
- saved views hang off a scope's tab bar as sibling routes;
- whichever axis is *above* the current scope (team on My Issues; version on a
  project-scoped list) becomes a **grouping** option, not a filter.

---

## A3 · Are the /my-issues tabs routes, and do they hold independent state?

**Both yes.** The four tabs are `<a>` elements with real hrefs
(`/my-issues/assigned`, `/created`, `/subscribed`, `/activity`), and each holds
its own complete display state. Read directly out of each tab's Display panel:

| | **Assigned** | **Created** |
|---|---|---|
| Layout | **List** | **Board** |
| Grouping | Grouping: Status · Sub-grouping: No grouping | Columns: Status · Rows: No grouping |
| Ordering | Created | **Manual** |
| Order completed by recency | on | on |
| Completed issues | **Past day** | **All** |
| Show sub-issues | on | on |
| Layout-specific block | List options → Nested sub-issues | Board options → Show empty columns |

Two tabs of the same surface differ in layout mode, ordering and completed-issue
window. State is per-route and persists across navigation and reload.

Note the panel is layout-dependent, not just value-dependent: List mode exposes
one `Grouping` axis plus `Sub-grouping`; Board mode exposes `Columns` and `Rows`
as two axes. `Sub-grouping` only appears once `Grouping` is not "No grouping".

---

## How it was reached

- `spec-up.sh`, then CCDP `Runtime.evaluate` over the raw WebSocket against the
  Linear tab (not `connectOverCDP`). Window normalised via
  `Browser.setWindowBounds` to the maximum this display allows.
- Sidebar: expanded **Your teams** and collapsed **Favorites** through real
  `Input.dispatchMouseEvent` clicks, waited 1.2s for the collapse animation to
  settle, then read geometry. Indents measured with a `Range` over the label
  **text node** — two earlier passes that measured the label's wrapper element
  disagreed (51 vs 57 for `Current`); the text-node measurement agrees with the
  2× screenshot and is the one recorded.
- A2/A3: navigated to each route with `Page.navigate` + 6.5s settle, opened each
  Display panel by clicking the real `Display options` button, read the panel's
  own text. Filter menus opened with the `f` accelerator and enumerated past the
  scroll fold.

## Not measured

- **Only one team exists in this workspace.** Multi-team ordering, whether teams
  sort alphabetically or by a stored order, and whether a second team's L2 block
  is identical, are all unverified. Everything said about "repeats identically
  per team" is inference from one instance.
- **No project-scoped issue list was opened.** A2's conclusion is built from
  My Issues vs Team Issues only. Whether a project's issue list has its own tab
  bar — and what is in it — is untested, and it is the closest analogue to your
  version scope. Ask for it before you commit the version route shape.
- **Subscribed and Activity tabs were not opened.** A3 rests on Assigned vs
  Created. Activity in particular may not be an issue list at all.
- **Favorites and Workspace sections were measured collapsed.** Favorite rows,
  favorite folders and their indent depths are not in this file; earlier work
  covers them in `favorites-row-affordances.md` and
  `favorites-folders-lifecycle.md`, at an unknown-but-different viewport.
- **Sidebar hover / active / drag states are not here.** This file is structure
  and routing only. `sidebar-row-wash.md` has the wash tokens.
- **Where per-route state is stored** (server, localStorage, URL) was not
  determined. Only that it survives navigation and a full reload.
- No claim about **collapse animation** timing or easing — the 1.2s settle was
  chosen to be safely past it, not measured.
