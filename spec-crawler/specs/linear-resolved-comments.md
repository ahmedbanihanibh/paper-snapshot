# Linear — resolved comments (trigger + panel + card)

Captured 2026-08-24, `test-workspace-bb`, **light**, viewport 1432×723, via
`scratchpad/resolved-comments.mjs` → `/tmp/thread.mjs` → `/tmp/panel2.mjs` →
`/tmp/panel5.mjs`. Pointer parked at `(40,640)` before every rest reading.

**How the state was produced** — it could not be captured by looking: the
workspace had no resolved threads. Created a document (`New document` on the
team Documents page), typed a paragraph, selected text, used the selection
toolbar's `Comment` (aria-label **exactly** `Comment` — a `/comment/i` match
grabs the header's `Show resolved comments` instead and opens the panel rather
than a composer), posted with ⌘Enter, then hovered the thread card and clicked
`Resolve thread`.

On resolve the thread **leaves the document gutter entirely** (its text is gone
from the DOM) and moves into the panel.

## 1 · Trigger — `Show resolved comments`

`28×28` · `border-radius 9999px` · `background lch(99.997 0.5 282)` (≈`#FFFFFF`)
· `border 0.5px solid transparent`, at `(1384, 61)` — in a `160×44` header strip
whose own radius is `0 0 0 8px` and ground `lch(97.94 0.5 282)`, sitting beside
the `Edited <date>` control.

## 2 · Panel

```
panel   360×188  flex column · overflow hidden      @ (1056, 93)
├ header 360×39  flex row · padding 12
│                · border-bottom 0.5px lch(91.9 0 282)   (#E8E8E8)
│  └ span "Resolved comments"  116×15 · 12px/500 · lch(40 1 282)  (#5E5E60)
└ list   360×149 flex column · gap 12 · overflow AUTO    ← the scroller
   └ card 336×125 · radius 8 · bg lch(100 0 282) · border 0.5px lch(91.9 0 282)
                  · shadow lch(0 0 0/.02) 0 3px 6px -2px,
                           lch(0 0 0/.04) 0 1px 1px 0
                  · overflow clip
```

Card inset is 12 per side (360 − 336 = 24), matching the header's padding. The
shadow is the same two-stop stack as the link popover and the menus.

## 3 · Card

```
card 336×125
└ 335×124
  ├ QUOTE  335×46  flex column · gap 6 · padding 10px 16px
  │  └ 303×26  padding-left 7 · border-left 2px lch(86.5 0 282)  (#D8D8D8)
  │            13px/400/20 · lch(40 1 282)
  │     └ p 294×26 · 15px/400/25.5 · lch(40 1 282)
  └ COMMENT 335×79  flex column · radius 0 0 8px 8px
     └ 335×78 · flex column · gap 6 · padding 12px 16px
        ├ row 303×18 · flex · align center
        │   ├ author block 191×18 (name 128×18) — avatar + name
        │   ├ time "1 minute ago" 55×16
        │   └ actions 57×30 · padding 1px 1px 1px 0 · bg lch(100 0 282)
        │        ├ Add reaction     28×28
        │        └ Comment options  28×28
        ├ body 303×24 · 15px/450/24 · lch(20 1 282)
        ├ reply row 315×22 · padding 6px 0 16px 12px
        └ divider 335×1 · border-top 0.5px
```

Both action buttons are present **at rest** — they are not hover-revealed (read
with the pointer parked, then again hovered: identical control list).

## 4 · The card's ⋯ menu — 7 rows

Rows are `height 32` · `padding 0 18px 0 14px` · `13px/400` · `lch(20 1 282)`.

| # | row |
|---|---|
| 1 | Edit |
| 2 | Unsubscribe from thread |
| 3 | **Reopen thread** ← the un-resolve path |
| 4 | Copy link to comment |
| 5 | Copy content as Markdown |
| 6 | New issue from comment… |
| 7 | Delete |

No row prints a shortcut. There is no `Resolve`/`Unresolve` button on the card —
reopening is a menu row.

## 5 · The live (unresolved) thread card, for contrast

`283×78` in the right gutter @ `(1085, 218)` · `radius 8px 8px 0 0` ·
`padding 12px 16px`. Controls, left to right: author name `128×18`, time
`52×16`, then three `28×28` buttons — **`Resolve thread`**, `Add reaction`,
`Comment options`. Present at rest as well as on hover.

So `Resolve thread` exists only on the LIVE card; the resolved card replaces it
with the menu's `Reopen thread`.

## Not measured

- **Dark theme** of the panel, card and trigger.
- The trigger's other states: with **zero** resolved threads (does the button
  exist at all?), hover, and open/active.
- Whether the panel **floats over** the document or displaces it — its x (1056)
  overlaps the comment gutter, and that was not resolved.
- The panel's **empty state** (can it be opened with nothing resolved?).
- **Many / overflowing**: the list is `overflow: auto`, but no scrollbar,
  fade or max-height was captured — only one card existed.
- Card **hover** ground, and whether clicking a card scrolls the document to
  the (now absent) anchor.
- What `Reopen thread` does to the document — driven not at all.
- Replies inside a resolved thread; a thread with more than one comment.
- The `Add reaction` popover.
- The avatar's own box (it sits inside the 191×18 author block, unseparated).
- Whether the anchor highlight survives in the document after resolve.
