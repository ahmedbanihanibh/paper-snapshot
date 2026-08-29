# Team resources (team overview) — measured 2026-08-26

Reference: `linear.app/test-workspace-bb/team/TES/overview`, dark, viewport
1432×723. Section root has a stable id: **`#pinned-resources`**.

Tree: `spec-bundle/extracted/team-resources-ref-tree.txt` (32 nodes).
Menu inventory: `spec-bundle/extracted/team-resource-row-menu.json`.

## Container skeleton (read from the tree, not from coordinates)

```
div#pinned-resources            712×148 · flex column · gap 8 · p 6 0 6 0 · r 8
  header row                    698×28  · flex row · ai center · jc space-between
                                        · gap 8 · m 0 2 8 12 · min-height 24
    span "Team resources"       136×22  · font 18/500
    actions                     60×28   · flex row · gap 4 · flex 0 0 auto
      button ×2                 28×28   · r 9999 · bd 0.5px · p 0 2 · min-w 28
        svg                     14×14
  list                          712×92  · flex column · ai stretch
    row[role=button]            712×42  · flex row · p 0 0 2 0 · relative
      inner                     712×40  · r 8
        a                       712×40  · flex row · ai center · gap 6 · p 0 12 · r 8
          span > svg > use      16×16 → use 12×14   ← SPRITE REF, must be inlined
          span label            font 13/500/16
    spacer                      712×8   · min-height 8
```

Row pitch is **42** (40 + a 2px bottom pad on the wrapper), not 40.

## Reordering — the affordance (#19)

**The whole ROW is the drag handle. There is no grip, at rest or on hover.**

Measured on the row wrapper:

```
role="button"  tabindex="-1"  aria-disabled="false"
aria-roledescription="draggable"
aria-describedby="DndDescribedBy-13"      ← dnd-kit's announcement id
```

- No `draggable` HTML attribute anywhere in the subtree → a POINTER sensor,
  not native HTML5 drag.
- Hover changes nothing structurally: node count inside `#pinned-resources`
  is **31 at rest and 31 hovered** — no handle is revealed. Row cursor stays
  `default`; the inner `<a>` is `pointer`.
- `tabindex="-1"` + dnd-kit means a keyboard drag path exists.

## Row context menu (#20) — 9 items, right-click

Captured once, in order. Every row 32h, every row has a leading icon.

| # | Label | Chord | Submenu |
|---|---|---|---|
| 0 | Unpin from overview | | |
| 1 | Duplicate | | |
| 2 | Rename… | ⇧R | |
| 3 | Unfavorite | ⌥F | |
| 4 | Copy | | ▶ |
| 5 | Remind me | ⇧H | ▶ (icon `#Alarm`) |
| 6 | Show document history | | |
| 7 | Delete | | |
| 8 | Open in desktop app | Ctrl⌘, | |

This is the DOCUMENT menu — the pinned resource is a document, and the
inventory matches `components/documents/document-menu.tsx` closely. Item 0
is "Unpin from overview" (state-derived, cf. §2c of the design-system doc).

## The "+" button opens a POPOVER, not the dialog (#21)

Our build jumps straight to an "Add link" dialog. The reference does not.

```
popover  202×121 · r 12 · p 0
         bg      lch(12.72 0.85 272)
         border  0.5px solid lch(25.68 1.93 272)
         shadow  lch(0 0 0/.125) 0 3px 8px, 0 2px 5px, 0 1px 1px
         a filter input, placeholder "Add resource", 13px/400,
           colour lch(91.178 1.425 272), padding 10px 0 9px, no border
         header text "Showing all items"
rows     New document
         Existing documents  ▶
         New link…                  ← this is what opens the dialog
```

There is no visible backdrop element behind it.

## "Add link to team" dialog — MEASURED (dark, viewport 1432×723)

Reached: section header "+" -> popover -> "New link…".

```
panel      540×288 @ (446,145) · r 12 · padding 0
           bg      lch(12.72 0.85 272)
           border  0.5px solid lch(25.68 1.93 272)
           shadow  lch(0 0 0/.10) 0 4px 40px, lch(0 0 0/.125) 0 3px 20px,
                   0 3px 12px, 0 2px 8px, 0 1px 1px          (FIVE layers)
backdrop   none — no full-viewport tinted/blurred element behind it
```

**POSITION — Ahmed's actual complaint, now a number.** The panel is NOT
vertically centred:

```
top            145px  = 20% of viewport height
panel centreY  289    viewport mid 362
              => sits 73px ABOVE centre
```

Ours is centred. Match the reference's rule, and re-measure at a second
viewport height before encoding it — 20%-from-top and centre-minus-73px
are indistinguishable at one size, and only one of them is the rule.

```
title    "Add link to team" · 15px/600 · lch(100 0 272) · 116×23 @ (503,178)
         HAS a leading glyph (the link icon) — hasLeadingGlyph: true
label    "URL" and "Title (optional)" · 475×24 @ x=479 (y 217 / 293)
         NOTE: 16px/400 is the computed size of the <label> ELEMENT; the
         visible text looks smaller in the screenshot, so a child span
         probably sets the real size. VERIFY before encoding 16px.
input    475×32 · r 8 · 13px/400 · bg lch(12.72 0.85 272)
         border 0.5px solid lch(34.32 1.93 272)
         first placeholder "https://…", second has NO placeholder
buttons  y=369, both 32h, both r 9999 (pill), 13px/500
         Cancel    68×32 @ (794,369) · bg lch(17.349 1.139 272)
                                      · fg lch(91.178 1.425 272)
         Add link  75×32 @ (878,369) · bg lch(47.918 59.303 288.421)
                                      · fg lch(100 5 288.421)
```

Field rhythm: label y 217 -> input y 245 (28px), input y 245 -> next label
y 293 (48px), second input y 321 -> buttons y 369 (48px).

### Deltas against ours (image #288)

| | ours | reference |
|---|---|---|
| entry | "+" opens the dialog directly | "+" opens a POPOVER; "New link…" opens the dialog |
| title | "Add link", no glyph | "Add link to team", WITH a link glyph |
| labels | none (placeholder-only) | real "URL" / "Title (optional)" labels above each field |
| close | an × top-right | none captured |
| URL field | carries a trailing avatar/chevron | not present |
| position | vertically centred | 73px above centre / top at 20% |

## NOT MEASURED — do not build these from assumption

- **The dialog at a SECOND viewport height** — needed to tell "20% from
  top" from "centre minus 73px". One size cannot distinguish them.
- **The <label> font size**, per the note above.
- **The dialog's light theme, focus ring, and validation/error state.**
- **Menu surface chrome + the two submenus.** The 9-item inventory is solid
  (captured once); the surface box/padding/shadow and the contents of
  `Copy ▶` and `Remind me ▶` are not. Three re-attempts hit a
  right-click that would not re-open — see the focus note below.
- **Drop indicator.** What the reference paints mid-drag (line? gap? ghost
  row?) and whether a drag can cross SECTION boundaries.
- **Sections.** This team's overview has a FLAT list. Ahmed's screenshots
  show grouped sections ("Test", "Untitled", "Docs") each with their own
  "Add link"/"Add resource" — that shape was not captured here.
- **Light theme.** Everything above is dark only.
- **Empty state** (a team with no resources) and **overflow** (many rows).

## Probe note

Switching between the localhost tab and this one steals OS focus; a tab with
`document.hasFocus() === false` swallows synthetic input while still
answering DOM queries perfectly, so a right-click "does nothing" and reads
like the app. `Page.bringToFront` + a real click into empty page area
restores it (`hasFocus: true`), which is what made the "+" capture work.

---

## "Existing documents ▸" picker — the checkbox (measured 2026-08-26)

Entry path: click the round **Add resources** button in the Team resources
header (28×28, `aria-label="Add resources"`), then hover the **Existing
documents ▸** row. Probe: `scratchpad/ref-checkbox.mjs` — a raw-CDP pointer
drive that reads computed styles with the submenu open.

| part | value |
|---|---|
| checkbox box | **14×14** |
| `border-radius` | **3px** |
| checked fill | `lch(53 52.26 286.91)` — this is our `--primary` (Linear indigo) |
| checked border | `1px solid lch(53 52.26 286.91)` — same colour as the fill |
| tick glyph | **10×9**, inset 2px, stroked `lch(100 5 286.91)` (white) |
| document glyph beside it | 16×16 |

**Method note, because the first run measured the wrong thing.** Scanning
the whole document for "small squares" returned the SIDEBAR's 14×14 icons
(all at `x≈20`) and reported `radius: 0px` — a confident answer about
elements that have nothing to do with this picker. The fix is to anchor on
something only the picker has (its `Search documents…` input), walk up to
the panel, and query inside that subtree. A measurement is only as good as
the proof it came from the surface being measured.

**Structure confirmed** (matches images #303/#305): search field on top,
muted time-group captions ("Today", "Last week"), then rows of
`checkbox · document glyph · title`. Already-pinned documents are SHOWN and
TICKED, not hidden — unticking removes the pin.

### Not measured

- The unchecked box's border colour and width (only the CHECKED state was
  reachable in the run that anchored correctly).
- Row height and the panel's own width.
- Light theme — all of the above is dark.
- Whether unticking in the reference removes the pin immediately or on
  submenu close.
