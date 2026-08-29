# Linear — document comments

Captured 2026-08-23 over CDP against `linear.app/test-workspace-bb`, dark
theme, viewport 1432 × 723. Every value below was read from the live app;
anything I could not reach is in **Not measured** at the bottom.

Entry path for the whole surface: open a document → select a paragraph →
the selection toolbar appears → press **Comment** (the last of its 15
controls).

---

## 1. The selection toolbar (context)

Full control order, left to right, measured at y=183 with the block at
x=420:

| # | Label | Box | x |
|---|---|---|---|
| 1 | Regular text | 42 × 26 | 338 |
| 2 | Bold | 26 × 26 | 386 |
| 3 | Italic | 26 × 26 | 418 |
| 4 | Strikethrough | 26 × 26 | 450 |
| 5 | Underline | 26 × 26 | 482 |
| 6 | Link | 26 × 26 | 514 |
| 7 | Quote | 26 × 26 | 546 |
| 8 | Collapse | 26 × 26 | 578 |
| 9 | Inline code | 26 × 26 | 610 |
| 10 | Code block | 26 × 26 | 642 |
| 11 | List | 42 × 26 | 674 |
| — | *divider* (16px gap) | | 716–732 |
| 12 | Create issue from selection | 26 × 26 | 732 |
| 13 | Ask agent | 26 × 26 | 764 |
| 14 | Comment | 26 × 26 | 796 |

---

## 2. The composer — INLINE, under the anchored text

Pressing Comment does **not** open a gutter card. It drops a pill
directly beneath the marked range; the thread only relocates to the
gutter once posted.

| Property | Value |
|---|---|
| card | 360 × 41, `radius 8` |
| card bg | `lch(12.72 0.85 272)` |
| card border | `0.5px lch(27.12 1.48 272)` |
| card shadow | `lch(0 0 0 / .125) 0 3px 8px`, `lch(0 0 0 / .125) 0 2px 5px` |
| inner form | `padding: 8px 16px` |
| avatar | 18 × 18 circle, initials 9px, at 16px from the card's left |
| field | 15px / 450, line-height 24 |
| placeholder | `Add a comment…` in `lch(41.778 1.425 272)` |
| submit | 24 × 24, `radius 50%`, `aria-label="Submit comment"`, icon 14 |
| submit — empty | bg `lch(17.349 1.139 272)` = `#2A2B2C` |
| submit — ready | bg brand blue `lch(47.918 59.303 288.421)` |

Enter alone did **not** post in the drive test; the submit button did.

---

## 3. The posted thread — right-gutter card

| Property | Value |
|---|---|
| card | 284 × auto at x=1085, `radius 10` |
| card bg — rest | `#1A1A1B` |
| card border — rest | `0.5px #29292C` |
| card bg — hover / focused | `lch(12.945 1.3 272)` = `#212123` |
| card border — hover / focused | `lch(20.505 2.38 272)` = `#303135` |
| card shadow — focused | the frame shadow (see composer) |
| avatar | 18 × 18 circle at (16, 12) inside the card, initials 9px |
| author | 13px / 500, `lch(100 0 272)`, 9px after the avatar |
| timestamp | 13px / 450, `lch(64.805 1.65 272)` = `#9C9DA0`, 8px after the name |
| body | 15px / 450, line-height 24, `lch(91.201 1.65 272)` = `#E5E6E9`, 251 wide |
| reply form | 283 × 41, `border-top 0.5px lch(25.905 2.38 272)`, `radius 0 0 8 8` |

**Timestamp format** (measured, not guessed): `just now` → `35min ago` →
`1h ago`. Note `min`, not `m`.

### Hover rail

Three round buttons, revealed on card hover, painted on an 85 × 30 patch
of the card's **own background** at (1273, 228) — so they OCCLUDE the
timestamp rather than reflowing the header. No layout shift on hover.

| Button | Box | x | aria-label |
|---|---|---|---|
| ✓ | 28 × 28, `radius 9999px` | 1273 | `Resolve thread` |
| ☺+ | 28 × 28 | 1301 | `Add reaction` |
| ⋯ | 28 × 28 | 1329 | `Comment options` |

Glyphs `lch(91.201 1.65 272)`, borders transparent.

### The ⋯ menu

Seven rows, 32px each, every one with an icon (all extracted verbatim
into `components/documents/comment-menu-glyphs.tsx`):

1. Edit
2. Unsubscribe from thread
3. Resolve thread
4. Copy link to comment
5. Copy content as Markdown
6. New issue from comment…
7. Delete

---

## 4. The anchor (marked text)

| State | Dark bg | Dark text | Light bg | Light text |
|---|---|---|---|---|
| resting | `lch(21.633 23.767 83.803)` = `#3F320F` | `#E3E4E6` | `#FDF0DB` | `#2F2F31` |
| focused | `lch(32.568 37.936 84.425)` = `#5D4A09` | `#E3E4E6` | `#FFE3A2` | `#2F2F31` |

Amber, not blue — blue is selection and links in the same paragraph.

### Light theme — the rest of the card

Captured after switching via **Settings → Account → Preferences →
Interface theme**, then re-opening a `#comment-…` link to force focus.

| Property | Light value |
|---|---|
| card bg | `#FFFFFF` |
| card border | `#E8E8E8` |
| card shadow (focused) | `lch(0 0 0 / .02) 0 6px 18px`, `lch(0 0 0 / .04) 0 3px …` |
| card shadow (resting) | `lch(0 0 0 / .02) 0 3px 6px -2px`, … |
| author | `#1B1B1B` 13 / 500 |
| timestamp | `#5E5E60` 13 / 450 |
| body | `#303032` 15 / 450 |

---

## 5. Comment deep links

`Copy link to comment` writes, verified by reading the clipboard after
granting `clipboardReadWrite`:

```
https://linear.app/test-workspace-bb/document/ddee-1daad9c37a3f#comment-7cfbaa42
```

`#comment-<8 hex>` — a short id, not the full row id.

**Opening that URL** (verified with `Page.navigate` + a fresh load) lands
the reader ON the thread:

- the anchor renders in the **focused** amber `#5D4A09`, not the resting one
- the card renders with the hover fill, the hover border **and** the frame
  shadow — i.e. lifted, not merely marked
- both are scrolled into view

---

## 6. Comments vs. version restore  ← measured 2026-08-24

The question: a comment anchor is a MARK inside the content, and restore
replaces the content wholesale. Driven end to end on the test document.

| Step | What the reference does |
|---|---|
| Comment on a paragraph | thread card in the right gutter, amber anchor on the text |
| DELETE the anchored text | the card **disappears**. No orphan card, no tombstone, no "original text deleted" state |
| Open ⋯ → Show document history | the older version's **preview still shows the amber anchor** — the mark is part of that version's stored content |
| Click **Restore version** | **no confirmation dialog**; it restores immediately |
| After restore | the anchor is back AND **so is the thread**, with its original comment and its original timestamp ("2h ago") |

The model this implies, and it is the important part:

- **Comment rows outlive their anchor.** Deleting the text does not delete
  the comments — if it did, the restore could not bring the conversation
  back, only the text.
- **The anchor is versioned with the content**, because it lives in it.
- **The gutter is filtered by what the content currently contains.** That
  is what produces "no orphan card" without deleting anything.

Ours matches: `workComments` rows are independent, `CommentMark` rides the
body, `workDocumentVersions` snapshots the whole body including marks.
The one divergence found and fixed: we rendered every thread regardless of
whether its anchor still existed, so a deleted quote left a card pointing
at nothing. `lib/work/documents/anchors.ts::anchorIdsInContent` now filters
the gutter (4 tests).

**Still not measured here:** whether the reference eventually garbage-
collects comments whose anchor has been absent for a long time, and what
happens to a thread when the anchored text is *edited* rather than deleted
(the mark presumably survives a partial edit — untested).

---

## Not measured

- **`Add reaction`** — the picker was never opened, so its panel, its
  emoji set and how a reaction chip renders on the card are unknown.
- **`Unsubscribe from thread`** — the row is measured, its effect is not
  (ours renders it disabled rather than lying about what it does).
- **A resolved thread's appearance.** Resolve was never pressed on the
  reference, so "what a resolved card looks like" is ours: we collapse it
  to its first comment at 60% opacity with an "N more in this thread"
  line. The reference may hide it, move it, or show a filter.
- **Multi-author threads.** Every comment in the test was mine, so the
  reply-row avatar stack and any "N replies" summary are unverified.
- **The author-name gutter's scroll behaviour.** The ⋯ menu stopped
  offering `Show author names` on the test document part-way through the
  session, so its pin offset could not be captured. Ours uses native
  `position: sticky` per author run.
- **Heading / block deep links.** Ahmed reports the reference may support
  linking to a heading (the outline rail's rows as URL targets). Not
  investigated.
