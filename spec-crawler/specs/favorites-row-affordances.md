# Favorites rows: item vs folder affordances

Captured live from Linear, 1440×900, and diffed against protocolbase's current
implementation on 2026-08-10.

The rule: **a favourited item is removed inline; only a folder gets a menu.**
Rename is a folder operation, because a folder's name is a thing the user typed.
An item's name belongs to the item it points at, so there is nothing to rename
from the sidebar and Linear does not offer it.

---

## A. Favourited item row (a chat, view, issue — anything that is not a folder)

Reveals a single inline **X**. Clicking it removes the favourite immediately.
There is no menu, no confirmation, and no rename.

| | |
|---|---|
| glyph | X / cross, 10×10 |
| element | the `<svg>` itself — `aria-label="Remove favorite"` sits on the svg, not on a wrapping button |
| position | x=213 in a row spanning x=12…232, i.e. **9px inset from the row's right edge** |
| vertical | centred in the 29px row (y=298 in a row at y=288) |
| colour | `lch(60.621 1.2 272)`, unchanged on hover |
| background | none, in every state — no wash, no pill |
| radius / padding | none |
| cursor | `pointer` |
| reveal | hidden until the row is hovered (`opacity` 0 → 1) |

Right-clicking a favourited item row produces **no** context menu — zero
`[role=menuitem]` nodes. The X is the only affordance.

Path (viewBox `0 0 16 16`, rendered at 10×10):

```
M2.96967 2.96967C3.26256 2.67678 3.73744 2.67678 4.03033 2.96967L8 6.939L11.9697 2.96967C12.2626 2.67678 12.7374 2.67678 13.0303 2.96967C13.3232 3.26256 13.3232 3.73744 13.0303 4.03033L9.061 8L13.0303 11.9697C13.2966 12.2359 13.3208 12.6526 13.1029 12.9462L13.0303 13.0303C12.7374 13.3232 12.2626 13.3232 11.9697 13.0303L8 9.061L4.03033 13.0303C3.73744 13.3232 3.26256 13.3232 2.96967 13.0303C2.67678 12.7374 2.67678 12.2626 2.96967 11.9697L6.939 8L2.96967 4.03033C2.7034 3.76406 2.6792 3.3474 2.89705 3.05379L2.96967 2.96967Z
```

## B. Folder row

Reveals a **⋯** (horizontal ellipsis) button that opens the folder menu.

| | |
|---|---|
| glyph | three dots, 16×16 icon in a 24×24 hit area |
| element | `aria-label="Folder menu"` on the 24×24 container |
| position | x=206 in a row spanning x=12…232, i.e. **2px inset from the right edge** |
| colour | `lch(100 0 272)` |
| background | none; radius `9999px` |
| reveal | hidden until the row is hovered |
| menu | **Rename**, **Remove folder** |

Path (viewBox `0 0 16 16`):

```
M3 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z
```

Note the two affordances are **not** the same size or the same inset. The X is
10px and sits 9px from the edge; the folder menu is a 24px target 2px from the
edge. They are visually aligned at their centres (X centre x=218, folder button
centre x=218) — matching the centres rather than the boxes is what makes a
mixed list of items and folders read as one column.

## C. Section header

`aria-label="Create new folder for favorites"` — a 24×24 button at x=206,
14×14 glyph, `opacity` 0 → 1 on hover of the header row, tooltip **"Create
folder"** after ~1.5s. Full spec and the extracted glyph:
`spec-crawler/assets/create-folder-icon.jsx`.

---

## What protocolbase does today (measured, not inferred)

A favourited chat row renders a **⋯ button, `aria-label="Chat menu"`, 16×16 at
x=208**, opening **Copy link / Rename / Remove favorite**.

So the folder affordance has been applied to item rows. Two consequences:

1. **Rename on a chat row has no referent.** The name shown is the chat's, and
   renaming it from the favourites list means either renaming the chat itself
   from a place that does not say so, or renaming only the favourite — an alias
   Linear does not have.
2. **Removing a favourite costs two clicks** where Linear costs one, and the
   destructive action sits in a menu next to a rename that looks equally safe.

### Required changes

- Favourited chat rows: replace the ⋯ menu with the inline **X**, `aria-label="Remove favorite"`, acting directly. Geometry in §A.
- Keep the ⋯ menu **only** on folder rows, with **Rename / Remove folder**.
- `Copy link` has no equivalent in Linear's favourites list. It is a protocolbase
  addition, not a fidelity gap — but it cannot stay on an item row without
  reintroducing the menu the X replaces. Move it to wherever chats are already
  acted on (the chat's own `Chat actions`), or drop it.
