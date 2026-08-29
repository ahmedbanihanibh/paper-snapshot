# Capture → Paper → re-content: the workflow and its traps

How PB dashboard frames are produced. **Never author a Linear-styled frame from
scratch** — hand-drawing means hand-drawing icons, and a redrawn icon is the most
visible way a clone stops being one. The pipeline is:

1. `capture_state` the real Linear surface (spec-crawler, Edge over CDP).
2. `paper_import --only <id>` → a real Paper artboard with real icons/styles.
3. **Look at it in Paper** (`get_screenshot`) before trusting it.
4. `duplicate_nodes` the import.
5. `find_nodes textValue:"*"` scoped to the duplicate → every Text node at once.
6. One batched `set_text_content` to re-content it as Protocolbase.
7. Fix pinned widths (below), `rename_nodes`, screenshot again.

Captured 2026-08-21.

## Trap 1 — capture labels lie about theme

`Emulation.setEmulatedMedia prefers-color-scheme` **resets on every navigation**.
Five captures were named `-dark`; only two actually were. Sampling proved it:

```
015-...-preferences-dark   DARK   <- real
016-...-members-dark       LIGHT  <- mislabeled
017-...-team-overview-dark LIGHT  <- mislabeled
018-...-issues-list-dark   LIGHT  <- mislabeled
019-...-inbox-dark         DARK   <- real
```

Linear stores theme **server-side** — there is no localStorage key to set, and the
theme combobox is a Radix select whose keyboard order is not what it looks like
(ArrowUp from "Light" landed on "System preference", not "Dark").

**The working method**: set Linear's theme to *System preference* once via the UI,
then per surface: navigate → re-apply the emulation → verify → capture. Verify by
reading a **painted pixel**, not `documentElement.className` (the class flips
before the theme provider re-resolves). Dark is confirmed by
`lch(5.52 0.4 272)` = dark `--color-bg-primary`. Scripts:
`scratchpad/dark.js`, `scratchpad/verify.js` (samples the PNG directly).

## Trap 2 — the structural dedupe is not an appearance check

`capture_state` dedupes on a DOM-structure hash. That means it will **refuse a
capture that looks completely different**:

- Selected vs rest tab pill → same hash, second capture rejected as "duplicate".
- Every PB dashboard route → **same hash**, because KeepAlive keeps all pages
  mounted in one DOM. Only the first route was ever written.

Consequences: to compare two states, capture the **container holding both** in one
shot (see `010-pill-tab-row-...`). To sweep PB's own routes, bypass spec-crawler
and drive CDP `Page.captureScreenshot` directly (`scratchpad/shoot.js`).

## Trap 3 — the Paper import silently drops virtualized table rows

`022-322-linear-settings-members` imports with its **table body missing** — group
headers ("Active 1", "Coding agent 2") render, the rows under them do not. The row
Text nodes exist in the tree and accept `set_text_content`; they just do not paint.
Linear's members table is virtualized/absolutely-positioned and the importer
flattens it wrong.

This is why step 3 above is mandatory. The frame reported a successful import.

**Which captures import faithfully** (verified by eye in Paper):

| capture | verdict |
|---|---|
| `020` team overview (dark) | clean — use for Overview |
| `009` documents table (light) | clean — use for Protocols / list routes |
| `015` settings preferences (dark) | clean — **use for all settings-family routes** |
| `022` settings members (dark) | **table body missing — do not use for tables** |

For settings-family routes (Settings, Billing, Integrations, Audit) build from the
**Preferences** capture's card/row anatomy, not the members table.

## Trap 4 — imported pills come out truncated

Captured pills render as `Overvi…` / `Docume…` / `Memb…`. This is the defect in the
older PB frame `5DR-0`. The pill `<a>` itself is fine (`width:auto`,
`padding-inline:10px`, `border-radius:9999px`); the truncation comes from the
capture pinning explicit pixel widths on **five wrapper frames plus the label**.

Chain shape, from the label node going up:
`label` → `label-1` = ring overlay → `label-2` = the `<a>` → `-3 -4 -5 -6` wrappers.

Fix (three `update_styles` entries):

```
wrappers + <a>   width: fit-content
label            width: auto, whiteSpace: nowrap, overflow: visible,
                 WebkitLineClamp: none, display: block
ring overlay     width: auto, left: 0, right: 0
```

Then set the row itself to `display:flex; gap:8px` to restore the measured gap.
Full pill anatomy and the selected/rest inversion: `scene-tab-pill.md`.

## Trap 5 — re-contenting can overflow a pinned text node

Text nodes carry their captured width. A longer replacement wraps and collides with
whatever sits below (a 3-line description overlapped the section heading). Either
keep the replacement close to the original length, or set
`width:auto; whiteSpace:nowrap` on the node **and its parent**.

## Trap 6 — `get_screenshot` on a whole artboard can serve a stale render

After `update_styles` cleared a nav row's fill, the artboard screenshot still
showed the wash. Screenshotting the **row itself** (`get_screenshot` on the small
node) showed it clean. The style change had landed; the artboard render was cached.
Verify a small edit on the smallest node that contains it, not on the 1432×723 frame.

Related: `contentHash.tokens` in every Paper response has been the same value
(`207e5796`) across hundreds of mutating calls in this session — it is **not** a
change signal. Do not use it to decide whether an edit took.

## Trap 7 — the slot a summary calls X is not always X

`find_nodes` ignores `rootNodeId` for `textValue` queries — it returns matches from
the whole page. `get_tree_summary` caps out around depth 3–4 regardless of
`maxDepth`. So the cheap way to know what a node is, is `get_tree_summary` on the
node itself (it prints the Text leaf) or `get_jsx` on its parent (prints fills and
classes too). Confirm before styling: a node recorded as "the Members nav row" was
the Members row, but the node recorded as "the API keys target" was the *Account*
group's row, not Administration's `API`.

## Trap 8 — the imported scene column overflows into the bottom dock

Every imported settings frame renders its content column at full content height
inside a 723px artboard, so the last card row draws straight through the 28px
bottom action bar ("Write SNMP development surface update / Generate a QAction /
… / Ask Protocolbase"). It reads as a collision, not as scrolled content, because
the captured dock has no fill of its own.

Do **not** invent a dock background to hide it — that is sampling a colour by eye.
Clip the scroll area instead, which is what the real app does:

```
scroll area (the dock's older sibling)
  overflow: clip; min-height: 0px; flex-grow: 1; flex-basis: 0%
```

Find the dock with `find_nodes` + filters `height:28px`, `flex-shrink:0`,
`width:100%` scoped to the artboard — it is unique. Its parent's **first** child
is the scroll area. Apply the fix to the two settings templates too, so future
duplicates inherit it.

## The shell palette — read off LIVE Linear, not off a capture

Measured 2026-08-22 by reading `getComputedStyle` on the running app (CDP) rather
than trusting any imported frame. **This is the reference. A capture is not.**

| role | element | dark | light |
|---|---|---|---|
| shell ground (behind sidebar + gutters) | `html.dark` | `lch(2.595 0.4 272)` = `#09090A` | `#EFEFF0` |
| **scene pane** (inset 8px, 1180×679 at x 244) | `main` = `--color-bg-primary` | `lch(5.52 0.4 272)` = `#121213` | `#F9F9FA` |
| card / row | | `#1C1C1D` | `#FFFFFF` |
| selected pill | | `#29292B` | — |
| button | | `#1B1C1D` | — |

The sidebar has **no fill of its own** — it shows the shell ground. That is why the
ground/pane pair is the whole of the dark shell: get those two wrong and every
frame reads flat.

Other live tokens worth having: `--color-bg-secondary lch(7.32% 0.85 272)`,
`--color-bg-tertiary lch(8.22% 1.3 272)`, `--color-bg-quaternary lch(9.345% 0.85 272)`,
`--color-border-primary lch(9.84% 1.48 272)`, `--color-border-secondary lch(14.16% 1.48 272)`.
`--color-bg-sidebar` and `--color-bg-scene` resolve to **empty** on the live app —
if a token board in the Paper file lists values for them, that board is wrong.

Probe script: `scratchpad/tok.js` — reads the tokens plus the first painted
ancestor under a sidebar point and a scene point. Re-run it before trusting any
shell colour.

## Trap 10 — the settings capture has the pane geometry but no pane fill

Both settings captures (dark and light) import with the scene column **inset and
rounded exactly like the app-shell frames, but transparent** — so the pane shows the
shell ground and the frame reads as one flat field. The app-shell captures carry the
fill; the settings ones do not.

Fix: paint the scene column (the 1188-wide flex column that holds the scroll area +
dock, i.e. the dock's **parent**) with the pane colour — `lch(5.52% 0.4 272)` dark,
`#F9F9FA` light. Do **not** paint it the ground colour; that was a wrong "fix" made
by matching one capture against another instead of against the product.

## Trap 9 — two captures of the same product can disagree on the ground colour

The Linear **settings** capture and the Linear **app-shell** capture do not share a
dark ground. Measured:

| | app-shell frames | settings frames (as imported) |
|---|---|---|
| artboard | `#09090A` | `#09090A` |
| **shell ground** (the 1432×723 inner wrapper) | **`#09090A`** | **`#19191C`** ✗ |
| scene pane | `#121213` | none — content sits straight on the ground |
| cards / sidebar rows | `#1C1C1D` | `#1C1C1D` |
| selected pill | `#29292B` | `#29292B` |

Side by side the settings frames read washed and flat — a mid-grey field instead of
near-black. Three nodes per frame carry it: the shell ground, the 1188×28 bottom
dock strip, and the 24×24 help button. Find them all at once with
`find_nodes` filtered on `background-color: #19191C` (no `nodeId` — sweep the whole
page), then set every hit to `#09090A`.

**Light is not affected** — both captures ground on `#EFEFF0`, verified on `Q9C-0`
(app-shell) and `108U-0` (settings). Do not "fix" light to match.

## The settings-shell recipe (dark) — measured, repeatable

The Linear **settings** capture is the shell for every PB admin-family route
(Team, API keys, Billing, Usage, Audit, Integrations, Import). Producing one new
route is four calls:

1. `duplicate_nodes [{id: <an already-PB-contented settings frame>}]` — one node
   only; three at a time overflows the tool's token limit. The response's
   `descendantIdMap` is the whole slot table, so no `find_nodes` round-trip.
2. one batched `set_text_content` over the ~43 content slots.
3. one `update_styles` moving the nav highlight (below).
4. `rename_nodes`.

**Sidebar row states, measured off the settings captures (both themes):**

| theme | | row background | label colour | icon fill |
|---|---|---|---|---|
| dark | selected | `#323438` | `#FFFFFF` | `oklch(100% 0 0)` |
| dark | rest | none | `#999A9E` | `oklch(68.6% 0.006 272)` |
| light | selected | `#E1E1E2` | `#1A1A1A` | `oklch(21.9% 0 0)` |
| light | rest | none | `#59595B` | `oklch(46.4% 0.003 282.5)` |

Note the light rest icon carries chroma on hue 282.5 while the light selected icon
is pure neutral — the two are not the same colour at different lightness.

The row wrapper carries `pl-[10px] rounded-trigger my-px`, the label sits two
frames deeper, the icon is a sibling `SVG` whose *paths* carry the fill — set all
of them or the icon and the text disagree.

**Scrolling the sidebar.** Linear's settings nav is ~1253px tall, so
`Administration` (Workspace / Projects / Members / Security / API / Coding agents /
Billing / Usage & limits / Import & export) starts at y≈831 and is off a 723px
artboard. `marginTop: -716px` on the nav list frame scrolls it into view and lands
the group boundary cleanly under the sticky search field. That group maps almost
1:1 onto PB's admin routes, which is why every admin frame uses the scrolled state.

The nav group's `childIds` are in **forward visual order**, header first:
index 0 = group header, 1 = Workspace, 2 = Projects, 3 = Members, 4 = Security,
5 = API, 6 = Coding agents, 7 = Billing, 8 = Usage & limits, 9 = Import & export.

## Not measured / not done

- Whether the members-table import failure also affects the **light** settings
  capture `013`/`K17-0` — not yet looked at in Paper.
- Whether Linear's own list virtualization glitch (rows collapsing and stacking on
  the right edge, seen live on `/team/TES/all`) can land *inside* a capture. It did
  not in `021`, but nothing prevents it — check every list capture by eye.
- A repeatable fix for importing virtualized tables at all.
- Light captures for inbox, and dark captures for the documents-table shape.
