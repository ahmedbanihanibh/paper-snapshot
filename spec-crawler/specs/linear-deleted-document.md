# The DELETED document state (#204)

Captured 2026-08-29, dark. Produced by creating a throwaway document and
deleting it through the UI — the document Ahmed linked had been restored by the
time I got to it (its header showed `Add to favorites` and no chip), which is
worth knowing: **the deleted state is not durable in a shared test workspace,
so produce it rather than expecting to find it.**

Scripts: `scratchpad/lin-204c.mjs` (delete + live menu + confirm dialog),
`lin-204d.mjs` (deleted state + reduced menu), `lin-204e/f.mjs` (chip, banner).

## 1 · Delete is CONFIRMED, and the dialog states the retention policy

> Delete "<title>"?
> Deleted documents are available in the "Recently deleted" view for 30 days,
> before the… *(truncated at 120 chars by the probe)*

Buttons: `Cancel`, `Delete`. So the 30-day retention that #206 has to build is
stated to the user at the moment of deletion — the wording is part of the
feature, not a detail.

## 2 · The document is READ-ONLY, not a tombstone

| | live | deleted |
|---|---|---|
| `.ProseMirror` blocks | renders | **still renders** |
| `contenteditable` | `"true"` | **`"false"`** |
| header buttons | Add to favorites · Document options · Copy document URL · Unsubscribe | **Document options · Copy document URL** |

The body staying visible is the point: a deleted document is a readable
archive, not an error page.

## 3 · The `Deleted` chip

| | value |
|---|---|
| plate | `[1355, 20, 61, 24]` · border `0.5px solid lch(27.12 1.48 272)` · padding `2px 6px` |
| label | SPAN `Deleted` `[1361, 23, 48, 16]` · `13px/450` · `lch(61.803 1.2 272)` · transparent |

Top-right of the header, left of `Copy document URL`.

## 4 · The "Document deleted" banner

| | value |
|---|---|
| plate | `[408, 207, 829, 41]` · bg `lch(10.149 0.593 272)` · radius **12px** · border `0.5px solid lch(18.48 1.48 272)` · padding `8px 8px 8px 12px` |
| glyph | 16×16 trash, inline SVG |
| label | `Document deleted` `[442, 219, 114, 16]` · `13px/normal 500` · `lch(90.451 1.2 272)` |

Full content width, directly under the title and above the body.

## 5 · The ⋯ menu collapses 10 rows → 2

**LIVE** (10): `Move to` ⇧P ▶ · `Pin to team` ▶ · `Duplicate` ·
`Rename…` ⇧R · `Favorite` ⌥F · `Copy` ▶ · `Remind me` ⇧H ▶ ·
`Show author names` ⇧A · `Show document history` · `Delete`

**DELETED** (2): `Copy` ▶ · `Restore document` **#**

Rows are `184 × 32`. The diff IS the specification: everything that edits,
files, or notifies disappears; only copying and restoring remain.

## Not measured

- **The delete-time toast.** Nothing matched in the bottom 220px after
  confirming. Either Linear shows none (the confirm dialog already carries the
  consequence) or my selector missed it — I did not distinguish these, so do
  not treat "no toast" as measured.
- Light theme for every value above; only dark was captured.
- The `Copy` submenu's contents in the deleted state.
- Whether `Restore document` (#) is bound as a global chord on this view, and
  what it does to the URL afterwards.
- The `Recently deleted` archive route itself (#206's own capture).
