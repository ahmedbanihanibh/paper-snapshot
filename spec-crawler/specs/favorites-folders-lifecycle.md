# Favorites folders — the full lifecycle

Driven against Linear with real CDP keystrokes and pointer events, 1440×900,
2026-08-11. Every commit path below was driven separately, not inferred from one.

---

## 1. The create gesture

Clicking the header's create-folder button produces an **inline editable row** —
no dialog, no popover (`[role=dialog], [role=menu]` count: 0).

It appears at the **top of the favorites list**, directly beneath the Favorites
header: header top y=259, editor y=290, so **31px below the header's top edge**,
above every existing favourite.

| | |
|---|---|
| row box | the standard 220×29 at x=12 |
| field | `<input>`, 186×28 at x=42 — i.e. **+30px from the row's left edge**, the same inset as a row label |
| placeholder | **`Folder name…`** |
| initial value | empty — no default name, nothing pre-selected |
| type | 13px / weight 500, `lch(100 0 272)` |
| focus | the input takes focus immediately on click |

### Commit semantics — four paths, four answers

| path | result |
|---|---|
| name + **Enter** | **commits** |
| name + **blur / click-away** | **commits** |
| name + **Escape** | **cancels** — no folder |
| empty + **Enter** | **discards** — no folder, no "Untitled" |
| empty + **blur** | **discards** — no folder, no "Untitled" |

> This reinstates the reading I withdrew earlier. It was withdrawn because the
> method was invalid — keystrokes that never reached the field — not because the
> answer was wrong. Driven properly, Enter and blur both commit.

## 2. Where a new folder lands

**Top of the list, newest first.** Creating a second folder places it *above* the
first. The field is focused on creation.

**Not measured:** whether creating scrolls the list when the favorites section is
long enough to overflow.

## 3. Rename

**The same widget as create** — build one component.

Identical `<input>`, identical placeholder `Folder name…`, identical geometry
(186×28 at x=42, 13px/500). The only differences: it is **pre-filled with the
current name**, and the text is **not pre-selected** (caret only, so typing
appends rather than replaces).

Reached from the folder row's ⋯ → **Rename**. That menu holds exactly two items:
**Rename**, **Remove folder**.

- **Enter** commits — verified (`ZB-blur` → `ZB-blur-renamed`).
- **Not measured:** blur, Escape and empty-name on *rename* specifically. My
  assertion for those checked the wrong row name and proved nothing. Do not
  assume they mirror create until someone drives them.

## 4. Remove folder — and what happens to its children

**No confirmation of any kind.** Immediate, `[role=dialog]` count 0 after the click.

**The children are removed from favourites entirely.** Verified by actually doing
it: a real favourite (`All issues`) was nested inside a folder, the folder was
removed, and afterwards `All issues` is **not in the favourites list at all** and
**not promoted to the top level**. A later independent scan confirms it is absent.

So the data-model answer is: deleting a folder deletes the favourite membership
of everything inside it. It does not orphan them upward.

## 5. Moving items in and out

**Drag is the only route.** There is no menu path:

- the folder row's ⋯ offers only Rename / Remove folder
- the item row offers only the inline ✕ (Remove favorite)
- right-clicking a favourites row produces no context menu at all

So for protocolbase's accessibility requirement, **Linear has nothing to copy** —
design a non-drag path and send it as a VERIFY.

Nesting by drag works, and this time it is confirmed independently rather than
from the drag returning success: after the drop the folder stops showing
`No items`, **collapsing the folder hides the child**, and re-expanding restores it.

**Not measured — drop feedback on a folder row.** My mid-drag probe returned only
zero-height elements, so I have nothing trustworthy on whether a folder row shows
a full-row wash versus the 2px insertion line used for reordering. That needs a
frozen frame during the drag, which is a separate capture.

## 6. The folder row's own glyphs

Measured read-only on an existing folder:

| glyph | position | size |
|---|---|---|
| folder icon | +10px from row left | 14×14 |
| caret | **+70px** — to the *right* of the label, not before it | 16×16 |
| ⋯ menu | +200px | 12×16 icon in a 24×24 target |

The caret path is **identical to the section header's** (`M7.00194 10.6239…`) — the
same triangle, same 16×16 box. So one component serves both.

**Not measured:** whether collapse state persists across a reload. The test
folder was cleaned up before that could be driven, and I will not leave a folder
in the workspace to measure it.

---

## Housekeeping

Everything created for this was removed: test folders `ZA-enter`, `ZB-blur`,
`ZB-blur-renamed` are gone, confirmed after a reload. All seven pre-existing
folders (`cascas`, `csaca`, `cas`, `cassa`, `test ahmed`, `csacas`, `sacxsa`)
are intact.

One side effect to flag: `All issues` is no longer favourited — it was the child
used for the folder-removal test, and removing the folder unfavourited it. I had
originally favourited it myself earlier for the indent measurement, so this
restores the workspace rather than damaging it, but it is worth stating plainly.
