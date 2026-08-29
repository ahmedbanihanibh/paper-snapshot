# The documents selection command dialog ("N documents" → Actions)

Reference: `linear.app/test-48bd-dd25/team/TES/documents`, DARK,
Chromium (:9222), viewport **1432 x 723**. Captured 2026-08-28 —
`scratchpad/ref-docsel8.mjs`, `ref-docsel9.mjs`, `ref-docsel10.mjs`.

## Reaching the state

The documents list is **TEAM-scoped**: `/{ws}/team/{KEY}/documents`.
Workspace-level `/{ws}/documents` returns Linear's "We could not find the
page you were looking for" — worth knowing before another session spends
a probe on it.

Rows carry a checkbox at rest (12x12, x=243, one per row — NOT
hover-revealed). Selecting two raises a bottom bar reading
`2 selected · Actions`; the `Actions` button (84 x 28) opens the dialog.

## The panel

| property | value |
|---|---|
| box | **356, 94, 720 x 450** |
| radius | 12px |
| background | `lch(12.72 0.85 272)` |
| border | `0.5px solid lch(25.68 1.93 272)` |
| shadow | five layers — `0 4px 40px /.1`, `0 3px 20px /.125`, `0 3px 12px /.125`, `0 2px 8px /.125`, … |
| padding | 0 (the rows carry their own) |

**VERTICAL POSITION — this dialog does NOT obey the Add-link third
rule.** At vh 723: `top = 94`, while `(vh - panelH)/3 = 91` and
`(vh - panelH)/2 = 137`. 94 is the same top the task records for
Linear's Create-issue composer at the same viewport, so the command
dialog belongs to that class: a **fixed 94px top**, not a proportional
one. Confirm at a second viewport height before encoding it (see Not
measured).

## The context line — a distinct band, and it is INTERACTIVE

Ahmed's "maybe label with the selection above" is real. It is its own
full-width band at the panel's very top:

```
box      357, 95, 720 x 34        ← full panel width, above the input
content  "2 documents"  +  ⌫ Backspace
```

The `⌫` is a live affordance, not decoration: **Backspace clears the
selection scope**. Its glyph is 11px/500 in `lch(64.714 1.425 272)` with
a `Backspace` screen-reader label beside it. We render no equivalent —
if we ship the band without the key, the band is a label where the
reference has a control.

## The input row

| property | value |
|---|---|
| box | 363, 135, **708 x 40** |
| radius | 12px |
| placeholder | `Type a command or search…` |
| font | 13px / 400 |
| colour | `lch(91.178 1.425 272)` |
| padding | `11px 112px 11px 12px` |
| background | transparent |
| bottom border | **none** — no divider under the input |

The **112px right padding** is not arbitrary: it reserves the trailing
`Ask Linear` + `TAB` affordance (label 12px/450 at x=968). Ours renders
`Ask Protocolbase  Tab` in the same slot, so the shape matches; the
reserve is what stops a long query running under it.

Below the input sits a **`Showing all items`** header before the rows.

## Row anatomy — measured through the whole chain

```
li             363, 181, 708 x 46   padding 0 12px   aria-selected="false"
 └ div         363, 181, 708 x 46
   └ div       375, 181, 684 x 46   ← icon 16x16 at x=375  (12px row inset)
     └ div     399, 181, 660 x 46   ← label + chord cluster
       └ div   399, 196, 586 x 16
         └ span 399, 196, 134 x 16  ← label, 13px / 450
```

- **Row pitch 46px** (rows at y 181, 227, 273, 319, 365, 411, 457 …).
- Icon 16x16 at the row's 12px inset; label starts 24px in, i.e. an 8px
  gap after the icon.
- Chords are `<kbd>` elements — `⌘ ⇧ ,` on row 1.

## Action inventory (visible without scrolling)

1. `Copy document URLs` — ⌘⇧,
2. `Copy document titles` — ⌘⇧'
3. `Copy titles as links` — ⌘C
4. `Copy document content as Markdown` — ⌘⌥C
5. `Remind me about these documents` — ⇧H
6. `Change document subscribers…` — ⌘⇧S
7. `Unsubscribe from document updates` — ⇧S

The `<kbd>` sweep over the whole list also yields `C`, `V`, `N`, `P`,
so **the list continues below the fold** — this is not the full
inventory. See Not measured.

## The SELECTED row — MEASURED IN PIXELS (this is #24)

Row 1 is selected on open. **The DOM says there is no plate and the DOM
is wrong.** Across all seven ancestors of the selected label,
`backgroundColor` is transparent and `boxShadow` is `none`, and
`aria-selected` reads `"false"`. A clipped screenshot says otherwise:

| | value |
|---|---|
| panel ground | `#262627` — `rgb(38,38,39)` |
| **selected-row plate** | **`#353537`** — `rgb(53,53,55)` |
| plate box | CSS **362.5 → 1070.5** (width **708**), **182.5 → 224.5** (height **42**) |
| inset in the row | row is 363,181,708x46 → **full row width, 2px inset top and bottom** |
| corner radius | **≈8px** — the left edge converges over 7.5 CSS px from the plate's top |

Label colour rides with it: `lch(100 0 272)` selected vs
`lch(91.178 1.425 272)` plain.

Method: `Page.captureScreenshot` with `clip {x:355, y:181|227, w:730,
h:46}` at dpr 2, decoded with the scratchpad's pure-Python PNG reader,
then scanning a **text-free column** (x=700) for the vertical extent and
a row through the plate's middle for the horizontal one. The plain row
at y=227 is uniformly ground except where its label sits — which is the
control that proves the band belongs to selection and not to the panel.

## Not measured

- **Light theme.** Every value is dark-only.
- **The full action list.** Seven rows are visible; stray `<kbd>`s prove
  more exist below the fold. The panel scroller was not driven.
- **The selected row's plate in LIGHT theme.** The dark values above are
  measured; light is not.
- **The vertical rule.** `top = 94` at vh 723 matches the Create-issue
  composer, but one viewport cannot separate "fixed 94" from a
  proportional rule that happens to land near it. Re-measure at 900 and
  560 before encoding.
- **Every glyph** (#23's half). Row icons are 16x16 at x=375; none were
  extracted in this pass.
- **The `Showing all items` header's own box/typography**, and whether it
  changes to a result count when the query filters.
- **Hover vs keyboard highlight** — whether pointing at a row moves the
  selection, and whether the treatment differs from the arrow-key one.

---

# RE-MEASURED END TO END, 2026-08-28 — three corrections above

Driven in ONE CDP session on :9222 (`scratchpad/ref-docsel12..17.json`),
Chromium/Edge 151, viewport **1432 x 723**, **BOTH THEMES** (light via
`Emulation.setEmulatedMedia`, `localStorage.darkMode` verified `"true"`
before and after). Entry path: `/test-48bd-dd25/team/TES/documents` →
click two row checkboxes → the `Actions` button (84x28 at 785,635).

**The panel carries no `role`.** The earlier probe looked for
`[role=dialog]`, found nothing, and reported "NO DIALOG" on a panel that
was open the whole time. Select it by BOX instead: 720x450 at top 94.

## Correction 1 — the context line is a CHIP, not a label

The 15px reading was the BAND's inherited font-size, taken off the
wrong node. The visible thing is a filled pill inside it:

```
band   357,95  720x34   padding 0 14px
chip   371,107 103x22   radius 10   padding 2px 6px   12px/400
  kbd  454,112  13x12   11px/500    + a 1x1 "Backspace" sr-label
```

The chip is BOTTOM-LEFT in the band (chip bottom 129 == band bottom).
Its computed `align-items: flex-start` / `justify-content: flex-end`
only parse that way as a COLUMN.

Chip fill == the row plate fill, in both themes (see correction 3).

## Correction 2 — "Showing all items" is not a header

It is a **1x1 visually-hidden `<span role="status">`** at 362,154 — a
screen-reader live region. The earlier note read it as a visible header
between the input and the rows; building one would have added a band
the reference does not draw.

## Correction 3 — the plate is `li::before`, and it is a THIRD colour

```
li::before   content:""   inset: 2px 0   border-radius: 8px
  dark   lch(20.82 1.3 272)   ≈ #353537   on ground lch(12.72 .85 272)
  light  lch(95 0 282)        ≈ #F1F1F1   on ground lch(100 0 282)
```

`inset: 2px 0` = **full row width**, 2px top and bottom. The 6px
horizontal inset that makes rows 708 inside a 720 panel lives on the
LIST wrapper (`padding: 0 6px; overflow: auto`), not on the plate.

This is NOT the menu-row plate. A menu rides `--menu-bg` (#212122 dark)
and its plate is #313234; this palette rides `--work-surface` (#262627
dark) and its plate is #353537. Four steps apart, same relationship to
two different grounds. Light values coincide at #F1F1F1.

Selected label `lch(100 0 272)` dark / `lch(10 0 282)` light; plain
`lch(91.178 1.425 272)` / `lch(20 1 282)`.

`aria-selected="false"` on the highlighted row — the DOM does not
express selection here at all. Label COLOUR is the only DOM tell.

## ⌫ Backspace — DRIVEN, and it is not what the name suggests

Pressing Backspace on an empty query **un-scopes the palette**:

| | before | after |
|---|---|---|
| panel | 720x450 at 356,94 | **unchanged** |
| context chip | "2 documents ⌫" | **gone** |
| rows | 14 selection commands | **13 generic workspace commands** |
| row selection | 2 rows + bulk bar | **intact, bulk bar still up** |

So it drops the SCOPE, not the selection. "Backspace clears the
selection" was the obvious reading and it is wrong.

## Full row inventory — 14, no longer "continues below the fold"

1. Copy document URLs ⌘⇧,
2. Copy document titles ⌘⇧'
3. Copy titles as links ⌘C
4. Copy document content as Markdown ⌘⌥C
5. Remind me about these documents… ⇧H
6. Change document subscribers… ⌘⇧S
7. Unsubscribe from document updates ⇧S
8. Pin to overview
9. Delete document
10. Create new issue… C
11. Create issue in fullscreen… V
12. Create new label…
13. Create new project… N then P
14. Create new document in…

Rows 10–14 are the generic tail, which is why the unscoped list is 13.

## Remaining anatomy (all confirmed this pass)

```
panel     356,94 720x450  r12  bg --work-surface  border .5px  overflow clip
          shadow: 0 4px 40px/.1, 0 3px 20px/.125, 0 3px 12px/.125,
                  0 2px 8px/.125, 0 1px 1px/.125
input blk 357,129 720x46  padding 6px 6px 0
  plate   363,135 708x40  r12
  input   708x40  r12  padding 11px 112px 11px 12px  13px/400  bb 0
  ask     "Ask Linear" 12px/450 at x=968; kbd "Tab" 24x17 r4 .5px 11px/400
list      357,175 720x370  padding 0 6px  overflow auto
  ul      363,175 708      (a 708x6 spacer row on top)
  li      363,181 708x46   padding 0 12px   gap 12   pitch 46
    svg   375,196 16x16    (row inset 12)
    label 399,196 13px/450 (i.e. icon + 8 — see note)
    kbd   20x21  r3  padding 4px  11px/450  border .5px lch(20.28 1.93 272)
          transparent ground, 3px between caps
```

**The 8-vs-12 gap note:** the li's computed gap is 12px, yet the label
starts 8px after the 16px glyph (375 + 16 + 8 = 399). The reference's
icon flex ITEM is narrower than the glyph it holds. Our build uses a
16px icon with `gap-2`, which lands the label at the same x — the number
that actually matters.

## Still Not measured

- **The vertical rule.** `top = 94` at vh 723 only. It matches the
  Create-issue composer at the same height, which is why the fixed-offset
  reading is plausible — but one viewport cannot separate "fixed 94" from
  a proportional rule that lands near it. Re-measure at 900 and 560.
- **Short-list panel height.** The reference's 450 was measured with 14
  rows overflowing a 370px scroller. Whether a 3-row palette still paints
  450 was not produced. Our build uses `max-h-[450px]` for that reason.
- **Every row glyph** (#23's other half). 16x16 at x=375, none extracted.
- **Hover vs keyboard highlight** — whether pointing at a row moves the
  highlight, and whether the treatment differs from the arrow-key one.
- **The 415x370 region at x=667** inside the panel. Empty in every
  capture; likely the Ask-Linear pane. Never populated, never measured.
