# Linear issue composer — Escape ladder and focus restore

Captured 2026-08-28, raw CDP on port 9222, Chromium (Edge debug profile).
Workspace `linear.app/test-48bd-dd25`, team TES. Composer opened with `c`.

## Entry path

`Page.bringToFront` **first**. Without it the tab reports
`document.hasFocus() === false`, Linear's global hotkeys never fire, and a
key probe silently measures nothing — the first run of this capture pressed
`c` and got zero dialogs, which looks exactly like "the shortcut does not
exist". Naming the mechanism because it will happen again.

Everything below ran in ONE CDP session per surface: a second attach closes
an open overlay (`feedback_overlay_capture_needs_one_session`).

## Measured — focus restore after an attribute picker closes

| Path | `document.activeElement` after |
|---|---|
| Status picker closed with **Escape** | `DIV[aria-label="Issue title"]` |
| Status picker committed with **Enter** (ArrowDown → Enter → "Todo") | `DIV[aria-label="Issue title"]` |

Both paths return the caret to the **title input**. The composer never
parks focus on the pill trigger it came from.

## Measured — the Escape ladder

**Clean composer** (picker opened and closed, nothing committed):

1. `Escape` → picker closes, focus → title input. `[role=dialog]` count 1.
2. `Escape` → composer closes outright. `[role=dialog]` count 0. **No confirm.**

**Dirty composer** (status committed as "Todo"):

1. picker already closed by `Enter`, focus on title input.
2. `Escape` → composer **stays open**; `activeElement` moves
   `DIV[aria-label="Issue title"]` → `FORM`. Escape in a text field exits the
   field first.
3. `Escape` → `Discard this issue? / Confirm that you want to discard this
   issue. / Cancel / Discard`.

So dirty state costs one extra Escape, and that extra press is the field
blur — not a swallowed key.

## Ours, for comparison (localhost:3000, same session shape)

Dirty dialog: `Escape` closes the picker but `activeElement` becomes the
**pill trigger button** (`inline-flex h-6 shrink-0 cursor-default`), not the
title. The next `Escape` has no observable effect, and the one after raises
our discard confirm.

The press COUNT matches Linear. The divergence is only the focus-restore
target, which is what makes our intermediate Escape read as dead: Linear's
does something visible (leaves the field), ours cannot.

Tracked as board #157. The first version of that task claimed our Escape was
swallowed and needed a third press "unlike Linear" — written from our side
only, before this capture, and wrong.

## Not measured

- Whether Linear's discard confirm is reachable by keyboard alone from the
  `FORM` focus state (Tab order inside the confirm, and whether Enter
  defaults to Discard or Cancel).
- The **clean** composer's behaviour when focus is on a pill trigger rather
  than the title — Linear never leaves focus there, so producing that state
  needs a Tab-driven entry path that was not attempted.
- Escape while a picker's type-to-filter query is non-empty: does the first
  Escape clear the query and a second close the picker (the two-stage model),
  or close immediately? This is the same open question as board #156 and is
  still unanswered for the composer's pickers specifically.
- Light theme. Nothing here is a painted value, so theme is not expected to
  matter — but it was not checked.
