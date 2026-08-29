# The menu filter input — hidden type-to-filter, and who gets focus

Reference: `linear.app/test-48bd-dd25/team/TES/overview`, DARK theme,
Chromium (:9222). Captured 2026-08-28 — `scratchpad/ref-filter2.mjs`,
`ref-filter3.mjs`, `ref-filterB.mjs`.

## The mechanism (this is the whole rule)

**Every menu surface owns a filter input. It exists from the moment the
menu opens, it holds focus immediately, and it is VISUALLY HIDDEN until
it has a value.** It is not mounted on the first keypress — that was the
hypothesis, and it is wrong.

Verified by querying before any key was pressed:

| moment | input in DOM | `document.activeElement` | on screen |
|---|---|---|---|
| before the menu opens | **no** (`absent`) | — | — |
| the instant it opens | **yes** | **the input** | no — `x: -99808` |
| after one character | yes | the input | **yes** — inside the panel |

How it hides — the classic visually-hidden wrapper, read off the ancestor
chain:

```
input            box  -99808, 283, 45, 36     ← parked far off-canvas
 └ FORM          box  -99808, 283,  1, 36     overflow hidden
   └ SPAN        box  -99808, 301,  1,  1     clip-path: inset(50%); position absolute
     └ DIV[role=dialog]  191, 301, 175, 153   ← the menu's own surface
```

So it IS part of the menu, just clipped to a 1px span. That matters for
us: focus never leaves the surface, so arrow keys and Enter keep working
without any focus juggling, and no separate "is the filter open" state
exists to get out of sync.

Placeholder differs per surface — `Filter…` on a row context menu,
`Add resource` on the team-resources "+" popover.

## Chrome, once it has a value

Measured on the section context menu (surface 191, 301, 175 wide):

| property | value |
|---|---|
| box | 206, 302, **148 x 36** (≈14px inset each side, at the panel's TOP) |
| font | 13px / 400 |
| colour | `lch(91.178 1.425 272)` |
| padding | `10px 0px 9px` |
| background | transparent |
| border | **none** — no divider under it |

Panel height tracks the list: 153 (4 rows, no filter) → 146 (filter + 3
rows) → **78** (filter + no-match state).

## Typing, arrows, Escape

Driven one character at a time (`ref-filter3.mjs`):

| step | rows | filter |
|---|---|---|
| open | 4 — `Add resources ▶`, `Copy link`, `Rename…`, `Delete…` | `''`, offscreen |
| type `c` | 3 — `Copy link`, `Delete…`, `Rename…` | `'c'`, visible |
| type `z` (`cz`) | **0** — empty state, panel 78 tall | `'cz'` |
| Backspace | back to 3 | `'c'` |
| **Escape** | **panel CLOSES** | — |

**Escape is ONE stage: it closes the menu outright and does NOT clear the
filter first.** Measured with a live query (`'c'`) in the box. Our
`feedback_radix_escape_capture_clear_input` note describes a two-stage
Escape for other inputs — it does NOT apply to this surface, and copying
it here would be a divergence.

`location.pathname` was unchanged by the Escape, so no navigation (unlike
Linear's document view).

## Who has focus when a filter-bearing SUBMENU opens — ENTRY-PATH DEPENDENT

The "Existing documents ▶" submenu owns a **visible** `Search documents…`
input (1017, 237, 170 x 36). Whether it takes focus depends on how the
submenu was opened — measured both ways in one session
(`ref-filterB.mjs`):

| entry | submenu open | `activeElement` |
|---|---|---|
| **hover** the trigger | yes (4 panels) | the PARENT's hidden `Add resource` input — **not** the submenu's |
| **click** the trigger | yes (same 4 panels) | **`Search documents…`** — the submenu's own input |

So: **Linear autofocuses a submenu's filter on CLICK entry only.** A
hover-opened submenu leaves focus on the parent, which is what keeps a
pointer sweeping across trigger rows from stealing the keyboard.

This is the correction to the assumption in the task ("a submenu that
owns a filter is VISIBLE on open and ALREADY FOCUSED"). Half right: the
input is always visible, but focus is conditional on the entry path.

## Not measured

- **Light theme.** All values dark-only.
- **Ranking/inclusion semantics.** Typing `c` kept `Copy link`,
  `Delete…`, `Rename…` and dropped `Add resources ▶`. That is not a
  substring match — `Add resources` contains a "c" and `Delete…` does
  not. Two readings fit (submenu rows excluded from filtering; or
  matches-first with the rest retained and re-sorted alphabetically) and
  this capture cannot separate them. Needs a query that discriminates,
  on a longer menu.
- **Arrow-key highlight.** After `ArrowDown`, no row carried
  `data-highlighted` or `aria-selected` — the same attribute-invisible
  highlight seen on hover (checklist 2026-08-28). Whether the cursor
  resets to the first match after filtering is therefore UNVERIFIED by
  DOM probe; it needs a pixel capture.
- **A count line.** No "Showing all items" → "N results" text appeared in
  the context menu at any query. The team-resources capture recorded such
  a header on the "+" popover; it was not reproduced here.
- **Whether Backspace on an EMPTY query closes the menu**, and whether a
  space or a paste behaves like a printable key.

---

## The MATCH RULE — measured 2026-08-28 on the 17-row issue context menu

The 4-row section menu could not discriminate between candidate rules, which
is why this stayed open. Linear's ISSUE context menu (right-click a row in
`/team/TES/all`) has 17 rows and settles it.

Full inventory, panel 605 x 180:

    Status S · Priority P · Assignee A · Due date ⇧D · Labels L · Project ⇧P
    More properties ▶ · Create related ▶ · Mark as ▶ · Copy ▶ · Convert to ▶
    Move ▶ · Open in ▶ · Favorite ⌥F · Subscribe ⇧S · Remind me ⇧H
    Delete ⌘⌫

| query | survivors (in the order returned) |
|---|---|
| `p` | Project, Priority, More **p**roperties, **Favorite** |
| `pi` | **Favorite** alone |
| `f` | Favorite |
| `c` | Copy, Convert to, Create related, **Labels** |

### It is WORD-INITIAL prefix, not substring

Substring is refuted twice, independently:

- `p` DROPPED `Copy` and `Open in` — both contain a p.
- `c` DROPPED `Subscribe` — contains a c.

What survives is every row with a WORD starting with the query, including
non-first words (`More properties` for `p`). And `pi` returning Favorite alone
proves it is a per-word PREFIX rather than "any word contains": `pi` is not a
prefix of `Priority` (`pri`), so Priority correctly drops.

### There is also a per-row SYNONYM list

Two survivors have no such word in their label at all:

- `Favorite` matched `p` AND `pi` — "pin" explains both exactly.
- `Labels` matched `c` — the synonym is not derivable from what is on screen.

The vocabulary is Linear's own. Ours reproduces the MECHANISM by letting each
caller write synonyms into the row's haystack.

### Results are RANKED, not filtered in place

For `p`, `Project` (menu position 6) came back ABOVE `Priority` (position 2).
The ranking rule is not derivable from four queries — we keep menu order
rather than guess it.

### REFUTED, so nobody re-runs it

The shortcut text is NOT in the haystack. `Delete` renders "Command
Backspace" and does not survive `c`.

### Instrument note

Two probes lied before this landed. A `Backspace`-heavy sequence between
queries returned an empty result for `f` that a FRESH menu returned Favorite
for — always re-open the menu between queries rather than editing the query
down. And the probe must be installed in the SAME CDP session that opens the
menu: a second attach closes the overlay, and `window.__m` does not survive a
navigation.

### CONTRADICTION — the SHORT menu does not obey the rule above (2026-08-28)

Both captures are real and both reproduce. Re-measured the 4-row section
context menu (team overview, right-click a resource row) in the same session
as the 17-row result:

    unfiltered   Add resources ▶ · Copy link · Rename… · Delete…      h=153
    query "c"    Copy link · Delete… · Rename…                        h=146

`Delete` and `Rename` have NO word starting with "c", so word-initial prefix
cannot explain this. Three rows of four survive; the only one dropped is the
SUBMENU row (`Add resources ▶`). And the ORDER changed — `Delete…` moved above
`Rename…`, which is alphabetical, where the menu's own order is Rename before
Delete.

So on the short menu the behaviour reads as: **submenu rows are excluded while
a query is live; the remaining leaf rows are all KEPT, with matches first and
the rest re-sorted alphabetically.** That is the second reading this spec
originally proposed, and it is confirmed for THIS shape.

On the 17-row issue menu the same query removed 13 of 17 rows outright
(`h=178`, and the dropped rows were absent from the DOM, not scrolled out of
view). So the two menus genuinely behave differently.

**Unresolved: what selects between the two behaviours.** Candidates — a row-count
threshold below which nothing is hidden; a difference between a menu whose rows
are mostly leaves and one that is mostly submenus; or a per-surface config. Two
data points cannot separate them. A menu of ~8 rows would.

**What we shipped, and why it is a knowing divergence:** `menuFilterMatches` is
word-initial prefix (64ea6179), which matches the LONG menu. Our own menus are
3–4 rows, i.e. the SHORT shape, where the reference keeps non-matching leaves
and we drop them. Board #156 carries this.

### The bracket, narrowed — 9 rows already FILTERS (2026-08-28)

The discriminating menu is the issue menu's `Copy ▶` submenu: 9 rows, opened by
CLICK so its own filter takes focus.

    Copy ID ⌘. · Copy URL · Copy title · Copy title as link ·
    Copy description as Markdown · Copy content as Markdown ·
    Copy git branch name · Copy as prompt · Make a copy…

Query `g` — only `Copy git branch name` has a word starting with g:

    before   9 rows, panel 312
    after    1 row,  panel 44

So a 9-row menu DROPS non-matching rows, exactly like the 17-row one. Three
data points now:

| rows | behaviour on a query |
|---|---|
| 4  | keeps every leaf, matches first, rest alphabetical, submenu row dropped |
| 9  | drops non-matching |
| 17 | drops non-matching |

**The switch therefore sits between 5 and 8 rows, or the 4-row menu is special
for a reason that is not row count.** Both remain possible; what is settled is
that "drop non-matching" is the NORMAL behaviour and the short menu is the
exception — the opposite of the reading that seemed likely from two points.

This matters for us because our menus are 3–4 rows (the exception) while our
document menu is ~10 (the norm), so a faithful implementation needs both.

### Role shape — Linear's menus are listbox/option, not menu/menuitem

Measured while targeting the above: `document.querySelectorAll('[role=menuitem]')`
returns **0** on an open Linear context menu, while `[role=option]` returns 17.
The panels are `role="dialog"` wrapping `role="listbox"`.

Ours use `role="menu"` / `role="menuitem"` (Base UI's default). Worth knowing
before writing any probe against either build — a selector that works on one
finds nothing on the other, which cost two probes here — and worth a decision
if we ever chase screen-reader parity.
