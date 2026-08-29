# Scope routes — the cycle and project analogues, and the rule that governs both

Answers MEASURE round 2. Supersedes nothing in `issues-scope-model.md`; extends
A2 from a two-route observation to a three-route rule.

Viewport 1432 × 723 CSS px, DPR 2, unless stated.

---

## 1 · The rule, stated

Your hypothesis was "the current scope axis disappears from grouping". It holds,
and the filter side holds too — but the rule is bidirectional and better stated
as:

> **Grouping and filtering each offer exactly the axes that vary within the
> current scope.** An axis that the route holds constant is removed. An axis the
> route makes meaningful is added.

Measured across four routes:

| axis | /my-issues | /team/TES/all | /cycle/active | /project/…/issues |
|---|---|---|---|---|
| **Focus** | ✓ | — | — | — |
| Status | ✓ | ✓ | ✓ | ✓ |
| **Assignee** | **absent** | — | **✓** | **✓** |
| Agent | ✓ | ✓ | ✓ | ✓ |
| **Project** | ✓ | ✓ | ✓ | **absent** |
| **Milestone** | — | — | — | **✓** |
| Priority | ✓ | ✓ | ✓ | ✓ |
| **Cycle** | ✓ | ✓ | **absent** | ✓ |
| Label | ✓ | ✓ | ✓ | ✓ |
| **Parent issue** | — | — | — | **✓** |
| Team | ✓ | ✓ | ✓ | ✓ |

Three independent confirmations:

- **Cycle route drops `Cycle`** from grouping — the scope axis, gone.
- **Project route drops `Project`** from grouping *and* promotes **`Milestone`**
  and **`Parent issue`** — the scope's child axes become groupable once the
  parent is fixed.
- **My Issues drops `Assignee`** — assignee is constant there (always me), so it
  is not a breakdown you can ask for. It reappears the moment the route stops
  fixing it. This one is the proof the rule is about *variance*, not about a
  hard-coded "hide the scope".

`Focus` exists only on My Issues; it is a personal-inbox concept, not a scope
axis.

### The same rule on the filter side, and it is the stronger claim

Filter menus, diffed against the 22-property baseline in
`issues-list-surface.md` §B6:

| route | delta from baseline |
|---|---|
| `/team/TES/all` | *(identical — 22 properties)* |
| `/cycle/active` | **`Cycle` removed** (21). `Added to cycle` retained. |
| `/project/…/issues` | **`Project` removed**, **`Initiative` removed**, **`Project properties` → `Project milestone`** (19) |

So the scope predicate is genuinely **unrepresentable in the filter language** of
its own route — not merely redundant, not merely pre-applied and hidden. And on
the project route, the axis *above* the scope (`Initiative`) drops out too: you
cannot filter a project's issues by initiative, because the project already fixes
it.

`Cycle` survives as a **display property** on the cycle route (the Display
properties pill row still lists it). Removal is from *grouping* and *filtering*
only, never from *display*. Worth keeping straight — display properties are a
different list with a different rule.

### What to build

For org / project / version, per route, compute two sets:

```
filterable(scope) = allAxes − axesFixedBy(scope) − axesAbove(scope)
groupable(scope)  = curatedAxes − axesFixedBy(scope) + childAxesOf(scope)
```

Do not model scope as a pre-applied removable filter. It is not one anywhere in
Linear, and building it that way lets a user delete their own scope.

---

## 2 · Cycle vs Project — which is the version analogue

Your mapping is right on lifecycle and wrong on chrome. Take cycle semantics with
project chrome.

| | **Cycle** | **Project** |
|---|---|---|
| navigation | **no tab bar** — breadcrumb `Team › Cycles › Cycle 1 ⌄` with an inline switcher on the last segment | **tab bar**: Overview · Activity · Issues |
| identity in URL | `/team/TES/cycle/active`, `/cycle/upcoming` — **positional** | `/project/{slug}-{id}/issues` — **stable slug+id** |
| lifecycle | `Planned → Upcoming → Current → (past)`, advanced automatically by date | status is user-set |
| time-box | mandatory start/end, burndown chart | optional target date |
| child axis | none | Milestone |
| index page | timeline gutter with a date axis, one row per cycle | plain project list |

**The positional URL is the thing to notice.** `/cycle/active` and
`/cycle/upcoming` are *roles*, not identities — the same URL points at a
different cycle next fortnight. A protocol version needs a stable identity
(`v1.2.3` must keep resolving), so take the project's `{slug}-{id}` URL shape,
not the cycle's positional one. Offer `/version/current` as an alias if you want
the convenience, but never as the canonical route.

Likewise, a version page needs somewhere to put a description, a changelog and an
activity trail. The cycle route has nowhere — it is a bare issue list plus a
right-hand progress panel. The project's **Overview / Activity / Issues** tab set
is the shape you want.

### The version-bump story — it is policy, not a button

I went looking for a "close cycle and roll forward" action and there is none.
The cycle overflow menu (`Cycle options`, 275 × 261 at 606,48) contains only:

> Edit cycle name and description… · Change cycle dates ▶ · Subscribe to cycle
> notifications ▶ · Favorite `⌥F` · Copy link · Subscribe to cycle calendar ▶ ·
> Open in desktop app `⌃⌘,`

Carry-over lives in **team settings → Cycles**, as standing policy:

- *"Automations can create future cycles, **carry over unfinished work**, and
  move issues in or out based on status."*
- Enable cycles · Cycle duration `2 weeks` · Cooldown duration `No cooldown` ·
  Cycle start `Monday` · Auto-create cycles `2 cycles`
- **Cycle automation** — "Capture all work in cycles by auto-adding issues to
  cycles based on their status type", one of:
  - `Active issues & due date` — auto-add started, unstarted, and due-dated
    issues matching the current cycle, or the next if in cooldown
  - `Started issues`
  - `Completed issues`
- Inline status line: *"Current cycle is Aug 11 – Aug 25, next cycle begins
  Aug 25"*

So the rollover is **configured once and executed by the clock**. No user ever
presses "close this cycle". If your version bump is a deliberate human act — and
for a protocol version it almost certainly is — you are building something Linear
does not have, and you should not look for its UI. Take the settings *shape*
(policy + an inline "what happens next" status line) and add the explicit action.

---

## 3 · Grouped selection — the four flags, resolved

You are about to implement these; here is the contract, measured on a 3-row
shift-click range crossing a status-group boundary on `/team/TES/all`.

**A selected run that crosses a group boundary renders as two runs, not one.**

| row | `first-selected` | `last-selected` | `first-in-group` | `last-in-group` | `::before` radius |
|---|---|---|---|---|---|
| TES-25 | true | false | false | **true** | **`8px`** |
| TES-59 | false | false | **true** | false | **`8px 8px 0 0`** |
| TES-58 | false | **true** | false | false | **`0 0 8px 8px`** |

TES-25 opens the run but is last in its group, so it closes itself and renders
fully rounded. TES-59 is mid-run but first in its group, so it opens a fresh
rounded top. The rule is a plain OR over both pairs:

```
top-left/right radius    = 8px if (data-first-selected || data-first-in-group)
bottom-left/right radius = 8px if (data-last-selected  || data-last-in-group)
                           0   otherwise
```

That is why all four flags exist, and it is not derivable from the selection
alone. Confirmed against the n=1 case (both pairs true → `8px` all round) and a
4-row within-group run (`8px 8px 0 0` / `0` / `0` / `0 0 8px 8px`).

### Correction to round 1 — the selected wash is two tokens, not one

`issues-list-surface.md` records the selected wash as
`lch(15.966 18.242 286.445)`. That value was measured with the pointer still on
the row I had just clicked. Selection and hover **stack**:

| state | `::before` background |
|---|---|
| selected, pointer elsewhere | `lch(12.141 17.792 286.445)` |
| selected **and** active (hover or cursor) | `lch(15.966 18.242 286.445)` |

Same hue, +3.8 L and +0.45 C when active. Round 1's figure is the *selected+active*
value. If you build one token you will get every unhovered selected row wrong.

### Entering selection — three routes confirmed

| gesture | effect |
|---|---|
| click the hover-revealed checkbox | selects that row |
| `x` on the cursor row | toggles that row |
| **shift-click a row body** | **range-selects from the last anchor to that row**, inclusive, across group boundaries |

`j` / `k` / arrows move the cursor only.

### Bulk bar at n > 1

Geometry is **invariant** — `253.8 × 44` at x 707.1 for n=1, n=3 and n=5. The
count is a separate text node from the word "selected" (`"3" | "selected"`), so
the label is `{n} selected` with no pluralisation change.

---

## 4 · Bulk bar vertical anchor — resolved, it is px

Round 1 flagged 52.5px as possibly ~7.3vh. It is not. Measured at three window
heights:

| window height | viewport | bar bottom | gap | gap as vh |
|---|---|---|---|---|
| 807 | 723 | 670.5 | **52.5** | 7.261% |
| 620 | 536 | 483.5 | **52.5** | 9.795% |
| 500 | 416 | 363.5 | **52.5** | 12.62% |

Constant 52.5px. Hard-code it.

---

## 5 · Falsification you asked for — is `data-active` load-bearing?

**Yes, and not only for the keyboard.** Two things a `:hover` rule cannot express:

**1. The keyboard cursor paints the hover wash with the pointer parked in the
sidebar.** Measured on `/team/TES/all` with the pointer at (120, 660): row
TES-48 carried `data-keyboard-active=true`, `data-selected=false`, and
`::before` = `lch(9.345 0.85 272)` — the hover wash, with nothing hovering it.
A `:hover` rule cannot paint a row the pointer is not over.

**2. The retention semantics are not expressible in CSS at all.** `data-active`
survives the pointer leaving the row as long as it stays inside the list
container — the *last hovered* row keeps the wash. `:hover` on the row is wrong
(it clears immediately); `:hover` on the container is wrong (it would wash every
row, or none — CSS has no "the last one the pointer touched").

So `data-active` is genuinely two states multiplexed onto one attribute: pointer
proximity *and* cursor position, with sticky semantics on the pointer side. If
you want to simplify, the honest simplification is to **split** it — `data-cursor`
for the keyboard and a plain `:hover` for the pointer — and accept that you lose
the sticky retention. That is a defensible product call; it is not the same
behaviour. What you cannot do is drop the attribute and keep the behaviour.

---

## How it was reached

- Raw CDP over the target WebSocket; `Page.navigate` + 7.5–8s settle per route;
  pointer parked at (120, 660) — outside the list container — before every read,
  per the round-1 retention trap.
- Filter lists opened with the `f` accelerator and read past the scroll fold.
  Grouping lists opened by clicking the Display button, then the value pill on
  the `Grouping`/`Columns` row, and reading the resulting floating list.
- Selection driven with real `Input.dispatchMouseEvent` (including
  `modifiers: 8` for shift-click) and `Input.dispatchKeyEvent`, then verified
  through the rows' data attributes and computed `::before` styles rather than
  from appearance.
- Viewport test via `Browser.setWindowBounds` at three heights, restoring 807
  afterwards and re-reading to confirm the value returned.
- Cycle settings read from `/settings/teams/TES/cycles`.

## Not measured

- **Both the cycle and the project I opened contain zero issues.** `Cycle 1` is
  `0 scope / 0% capacity`; the project's Issues tab had `rowCount: 0`. So the
  grouping and filter lists are measured, but a **populated** cycle or project
  list — group headers, ordering, the progress panel with real numbers, the
  burndown with a real line — is not. If the version page's populated state
  matters before you build it, say so and I will seed issues into a cycle.
- **The cycle empty state was captured; the project empty state was not** beyond
  `rowCount: 0`.
- **No cycle was allowed to roll over.** The carry-over behaviour is quoted from
  the settings copy and the automation options, not observed. I did not watch an
  issue move between cycles.
- **`Cycle options` submenus not opened** — `Change cycle dates ▶`,
  `Subscribe to cycle notifications ▶`, `Subscribe to cycle calendar ▶`.
- **The cycle switcher (`Cycle 1 ⌄` in the breadcrumb) was not opened.** I assume
  it lists cycles; unverified.
- **Project grouping list may be truncated at the top.** It read
  `Status, Assignee, Agent, Milestone, Priority, Cycle, Label, Parent issue, Team`
  with no leading `No grouping`, where every other route had one. Probably my
  capture clipped the first row rather than a real difference — treat
  `No grouping` as present until re-checked.
- **Escape on a cycle route navigates up the breadcrumb** (Cycle 1 → Cycles). Hit
  once and worked around; the general Escape-to-navigate-up behaviour across
  routes is uncharacterised.
- Selection persistence across navigation, select-all, and `⇧↓` range were not
  driven. Only checkbox, `x`, and shift-click.
- No motion anywhere in this file.
