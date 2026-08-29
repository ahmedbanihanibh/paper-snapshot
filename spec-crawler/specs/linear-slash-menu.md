# Linear — the document slash menu

Reference: `linear.app/test-workspace-bb`, document body editor, **light
theme**, viewport 1432 × 723. Captured 2026-08-24 over raw CDP.

**Entry path** (this took several attempts and is worth writing down):

- The menu does **not** open from `Input.insertText`. It needs a real key
  press: `rawKeyDown` → `char` → `keyUp`. Passing `text` on `rawKeyDown`
  *and* sending a `char` inserts the character twice.
- The caret must be in an **empty** paragraph. `/` typed at the start of a
  paragraph that already has text does not open it.
- The menu **closes when the CDP connection cycles**, so open-and-measure
  must happen in ONE script run.
- A finder based on `[role="option"]` finds nothing — Linear's rows are
  plain `div`s. Proximity-to-caret also fails: the sidebar's changelog
  card sits closer. The reliable finder is **content-based** (the only
  floating box listing block types) with `left > 250` to exclude the rail.

---

## Panel

| Property | Value |
|---|---|
| width | **227** |
| scroller | `overflow-y: auto`, clientHeight **385**, scrollHeight 482 |
| row height | **34** |
| row padding | **`0 14px`** |
| row radius | **0** — rows are full-bleed, not inset pills |
| row font | **13px / 400** |
| icon | **16 × 16**, `gap: 16px` to the label |
| row colour (light) | `lch(10 0 282)` |

## Rows — the visible 13, in order

| # | Label | Chord |
|---|---|---|
| 1 | Heading 1 | ⌘⌥1 |
| 2 | Heading 2 | ⌘⌥2 |
| 3 | Heading 3 | ⌘⌥3 |
| 4 | Bulleted list | ⌘⇧8 |
| 5 | Numbered list | ⌘⇧9 |
| 6 | Checklist | ⌘⇧7 |
| 7 | Insert media… | — |
| 8 | Insert gif… | — |
| 9 | Attach files… | ⌘⇧U |
| 10 | Code block | **⌘⇧\** |
| 11 | Diagram | — |
| 12 | Collapsible section | ⌘⇧6 |
| 13 | Blockquote | ⌥⇧. |

**Search-only rows exist.** `Divider` (**⌘⇧-**) is not in the visible 13
and appears when you type `/div`. So the item set is larger than the
resting list, and a build that ships only the visible rows is short.

## Search behaviour

| Query | Result | What it proves |
|---|---|---|
| `head` | Heading 1 · Heading 2 · Heading 3 · **Heading 4** | h4 exists as a row |
| `image` | **Insert media…** | ALIASES — the label contains no "image" |
| `div` | **Divider** | search-only rows |
| `quote` | **nothing — the menu CLOSES** | NOT substring: "Blockquote" does not match "quote" |

So matching is **word-start on the label, plus an alias table** — not
substring, and not fuzzy.

## Empty results

A pill, 227 × 43, reading **`No results found`** followed by
**`Dismiss`** (13px / 450, `lch(40 1 282)`). The menu does **not** unmount
silently.

## The query chip

While the menu is open, the typed `/query` renders as an inline chip **in
the document text**:

| Property | Value |
|---|---|
| background | `rgba(0, 0, 0, 0.035)` |
| radius | 4 |
| padding | `2px 6px 2px 4px` |
| colour | `lch(19.588 1.25 282)` |
| height | 24 |

## Chord verified by driving it

**⌘⇧\ creates a code block** — pressed in an empty paragraph, a `<pre>`
appeared. An earlier diff row was read backwards and our build was
rebound to ⌘⌥C; corrected.

---

## Build result — every IN row DRIVEN in ours (not read in the source)

| Row | Reference | Ours, driven |
|---|---|---|
| panel width | 227 | **227** |
| max height | 385 | **385** |
| row box | 34px, `0 14px`, radius 0 | **34px, `0 14px`, radius 0** |
| row font / gap | 13px / 16px | **13px / 16px** |
| `image` | Insert media… | **Insert media…** |
| `div` | Divider (search-only) | **Divider**, hidden at rest |
| `quote` | nothing — menu shows the empty state | **No results found · Dismiss** |
| `zzzz` | No results found · Dismiss | **No results found · Dismiss** |
| query chip | r4, `2px 6px 2px 4px`, h24 | **r4, `2px 6px 2px 4px`, h24** |

One caveat recorded honestly: the dev server was serving a STALE CSS
chunk (it carried an earlier edit from the same session but not the
newest), so the query chip was verified by injecting the exact source
rule at runtime. The rule in `app/globals.css` is the one measured; it
will apply on the next real CSS rebuild.

## Build contract

**IN** — `slash-rows-order`, `slash-chord-labels`, `slash-panel-chrome`,
`slash-row-geometry`, `slash-empty-state`, `slash-alias-search`,
`slash-word-start-match`, `slash-query-chip`, `slash-scroll`,
`theme-light`, `theme-dark`.

**OUT**, with reasons stated before the build:

- `Diagram` row — the node does not exist (P4). A row that inserts
  nothing is a dead affordance, so it ships with the node, not before.
- `Collapsible section` row — same, P4.
- `Insert gif…` — no gif picker exists; same rule.
- `Heading 4` — the schema is h1–h3 (P4). Its row ships with the level.

**PRESERVE** — the existing slash items that work and their run
functions; keyboard nav (↑/↓/Enter/Escape); the `Suggestion` plumbing;
`onAttachFiles` / media wiring.

**DONE** = every IN row driven in our editor, not read in the source.

---

## Not measured

- **Dark theme values for the menu.** The reference is currently in light
  and the switch is expensive to drive; the light values above are
  captured, dark is not. Ours uses semantic tokens, so it renders in both
  — but the dark *numbers* are unverified.
- **The full search-only row set.** `Divider` was found by guessing a
  query. There may be more; the only way to enumerate them is to type
  many queries, which was not exhausted.
- **Hover vs keyboard-active treatment.** Every row measured
  `background: rgba(0,0,0,0)` — including the first, which should be
  active. So the active treatment is painted somewhere I did not look (a
  child element, or an outline), and remains unknown.
- **Flip-up behaviour** near the viewport floor.
- **What Dismiss actually does** — closes the menu, or also removes the
  typed query? Unverified.
- **`Insert gif…` and `Diagram` panels** — never opened.
