# Team → Documents tab (measured)

Entry path: team page → `Documents` tab (`/team/EMP/documents`). Captured at
viewport 1432 with a 221px sidebar; the content frame is 1203 wide. Trees:
`spec-bundle/extracted/linear-team-documents-{tree,rows,body}.txt`.

## Header

Identical to the Overview header (88px, two 44px rows) except the tab row
gains two controls on the right:

| control | box | fill | contents |
|---|---|---|---|
| `New document` | 126×28, r-full, `padding: 0 10px 0 8px` | `#1B1C1D` dark (`--round-action-bg`) | 14px glyph + 6px gap + 12px/500 label |
| `Display options` | 28×28, r-full | same | 14px two-bar glyph |

## Column head — 1203×32

`flex`, `gap: 6`, `padding: 0 18px 0 50px`. Each header is a 24px round
button with `padding: 0 6px` and a matching `margin: 0 -6px`, so the hit
target grows without moving the column's x. Label 12px/450 in
`--muted-foreground`; a 12px sort arrow follows on a 2px gap and is
opacity-revealed.

Tracks, left to right: Name (flex, 691 at this width) · Created 120 ·
Last edited 120 · Owner 140 · a 40px spacer that reserves the row's ⋯.

Sort arrow: ONE glyph — a filled chevron head plus a stem, viewBox 16 drawn
at 12, pointing UP for ascending and rotated 180° for descending. The
active header's `aria-label` is the direction it will apply next: `A-Z` /
`Z-A` for text columns, and inactive headers read `Order by <Column>`.

## Body

Scroller with `padding: 0 0 8px 0`.

### Group header — 1203×36, sticky at `top: -0.5px`

Inner block `margin: 0 8px` (→1187 wide), `padding: 0 10px 0 2px`,
`gap: 8`, `radius: 8`, and a **90° gradient of the team tint** bleeding in
from the left over the row ground:

```
background: linear-gradient(90deg, <team tint> 0%, <ground> 100%), <ground>
ground = #1A1A1B dark / #EFEFF0 light   (same value as the row hover)
```

Contents: a 28px slot holding a 20px round collapse button · an 18px slot
with the 14px team mark · label 13px/500 in `--secondary-foreground` ·
the count in the TEAM's own colour, 12px/500.

The collapse glyph is a **filled triangle**, not a chevron: it points right
when collapsed and is rotated a quarter turn down when expanded.

**There is no select-all in the group header.** Selection is per row only.

### Row — 1203×48

`flex`, `gap: 6`, `padding: 0 18px`, `radius: 8`. The hover fill is an
**absolute overlay inset 8px per side** (1187 wide), not a background on
the row — a background would run 10px wider than the reference's.

| cell | width | contents |
|---|---|---|
| select | 22×22 | 14px checkbox, `radius 3`, 1px border `#737476` dark / `#7C7C7C` light |
| name | flex (695) | 16px doc glyph + 8px gap + 13px/500 foreground |
| created | 120 | 13px/450 `--secondary-foreground`, relative ("1d ago") |
| last edited | 120 | same |
| owner | 140 | 18px round avatar (9px/400 initials) + 8px + 13px/450 |
| ⋯ | 40 | 32×32 round, revealed on hover |

Track arithmetic: `18+22+6+695+6+120+6+120+6+140+6+40+18 = 1203`.

Relative time keeps HOURS up to a full day — the same table shows both
"24h ago" and "1d ago", so that boundary is real.

### Row ⋯ menu — 231 wide, 32px rows

`Move to ⇧P ▸` · `Pin to overview` · `Duplicate` · `Rename… ⇧R` ·
`Favorite ⌥F` · `Copy ▸` · `Remind me ⇧H ▸` · `Show document history` ·
`Delete` · `Open in desktop app ⌃⌘,` — with separators after Rename,
Remind me, and Delete. Rows are `role="option"` inside a `role="listbox"`,
NOT `menuitem`; the menu also carries a hidden `Filter…` input.

### Display options popover — 301×224

`Grouping: Project` · `Ordering: Name` · `Show inactive projects` ·
`Show only my projects` · `Display properties: Owner · Last edited ·
Created`.

## Empty state

The column head and group header are **not rendered** — the whole table is
replaced by a 280-wide column, centred, items left-aligned, `gap: 24`:

- the 74×81 document-stack illustration (14 paths; five colour slots —
  face `--panel`, two mid-greys, `--muted-foreground`,
  `--secondary-foreground`)
- title "Team documents", 15px/600 lh 23, `--secondary-foreground`
- body "Create documents to share notes, decisions, and plans with your
  team.", 13px/450, `--muted-foreground`
- CTA "Create document", 120×28 r-full, `--primary` fill, 12px/500,
  `shadow: lch(0 0 0/.3) 0 .5px 1px 1px`

## Delete confirmation — 480×192

`radius 12`, `padding 32`, border `0.5px #3C3D40`, shadow
`lch(0 0 0/.1) 0 4px 40px, lch(0 0 0/.125) 0 3px …`. Title 15px/600 lh 23,
6px below it a 15px/450 lh 23 muted body. Footer right-aligned, 16px above:
Cancel (32h pill, `#2A2B2C`) then Delete (32h pill, red).

Copy: `Delete "<name>"?` / "Deleted documents are available in the
'Recently deleted' view for 30 days, before they are permanently deleted."

## Not measured

- The Display-options popover's own row anatomy (only its labels were read).
- The `Move to`, `Copy` and `Remind me` submenus.
- Multi-select and any bulk-action bar — never reached; our build's bulk bar
  is therefore OUR design, not the reference's.
- Keyboard navigation of the table (j/k, space to select).
- The light-mode illustration ramp was measured, but the light empty state
  as a whole was not re-captured after the theme switch.
- Drag-reorder of rows (the reference may not have it here at all).
- The group header in a multi-group configuration (grouping was left on
  its default, which yields one group).

## Reaching these states

Switching Linear's theme: `⌘K` → `theme` → click the row matching
`/Change interface theme(Light|Dark)$/`. **Never press Escape after** — the
palette previews live and Escape cancels the preview.

CDP clicks are unreliable on this app unless the tab was just brought to
front (`browser_attach` or `Page.bringToFront`); an ignored click reads as
"the menu did not open" and wastes a round trip.

---

# The document page + editor (measured)

`/{workspace}/document/<slug>-<id>`. Tree:
`spec-bundle/extracted/linear-document-page-tree.txt`.

## Page

- header: ONE 44px row, `padding: 0 12px 0 8px`. Breadcrumb =
  `[team mark] <team> › Documents › [doc glyph] <title>` with a 13px/500
  muted `›` and 8px either side, then ☆ and ⋯ (28px round ghosts). Right:
  Copy document URL + a bell (subscribers).
- body: `flex row justify-center`; scroller `padding: 0 48px`; a floating
  `Edited <date>` control pinned top-right on a `--panel` plate with
  `box-shadow: 0 0 8px 4px <panel>`.
- writing column **805 wide**, `margin-top: 64`.
- icon slot 48×36 holding a 24×24 button; title `margin: 6px 0 16px`,
  **24px/600 line-height 32**.

## Typography + placeholders

| field | font | placeholder | placeholder colour |
|---|---|---|---|
| title (`aria-label="Document title"`) | 24px/600, lh 32 | **"New document"** | `#565759` |
| body (`aria-label="Document content"`) | **15px/450, lh 24**, colour `#E3E4E6` | **"Start writing…"** | `#565759` |

`#565759` is `--muted-foreground` at 50% over the panel. The body is a
size UP from an issue description (13px) — the same editor therefore needs
a density, not a hardcoded scale.

## Slash palette

Grouped, with a hairline between sections:

```
Heading 1 ⌘⌥1 · Heading 2 ⌘⌥2 · Heading 3 ⌘⌥3
───
Bulleted list ⌘⇧8 · Numbered list ⌘⇧9 · Checklist ⌘⇧7
───
Insert media… · Insert gif… · Attach files… ⌘⇧U
───
Code block ⌘⇧\ · Diagram
```

Note `Numbered list` is ⌘⇧**9** and `Checklist` is ⌘⇧**7** — easy to swap.
Blockquote is NOT in the palette (it stays a `> ` input rule).

## Code block

| part | value |
|---|---|
| `pre` background | `#09090A` — the app GROUND, darker than the panel it sits on |
| `pre` border / radius | `0.5px #2C2D2F` / `6px` |
| `pre` margin-top | `22px` |
| `code` | `padding 16`, **13.125px/450**, lh `18.375`, `#E3E4E6`, mono |
| toolbar | pill at `top 10 right 10`, `padding 2`, radius full, bg `--panel`, border `0.5px #212224`, `transition: opacity 80ms ease-out` |
| · Change language | 80×27, `padding: 6px 6px 6px 8px`, radius full — label 12px/450 `#959597` + 16px chevron |
| · Enable line wrap | 26×26 round, 16px glyph |
| · Copy content | 26×26 round, 16px glyph |

Glyph path data for all three is in
`spec-bundle/extracted/linear-codeblock-chrome.json` — extracted, never
redrawn.

### Code-block syntax highlighting

The reference emits **highlight.js class names** (`hljs-keyword`,
`hljs-title function_`, `hljs-params hljs-literal`, …), so the theme is
transcribable 1:1 rather than approximable. 63 classes were captured
across 12 grammars (HTML · Diff · Bash · Markdown · CSS · Go · Java ·
TypeScript · Python · PHP · Ruby · JSON) in **both** themes —
`spec-bundle/extracted/linear-codeblock-syntax-merged.json`.

They collapse onto exactly nine families:

| family | classes | dark | light |
|---|---|---|---|
| keyword | keyword · built_in · operator · function · *.keyword | `#E394DC` | `#9532A4` |
| name | variable · params · attr · attribute · symbol · property | `#FCE27D` | `#8A5D00` |
| title | title (class_/function_) · subst · addition · section | `#25F8CA` | `#00755C` |
| type | type · regexp · selector-tag · selector-class · tag>name · link | `#EB6E3D` | `#A74002` |
| string | string | `#00C5F0` | `#025F8C` |
| comment | comment · quote | `#565759` | `#9C9D9F` |
| number | number | `#2482D8` | `#00264D` |
| literal | literal · deletion | `#EC3B40` | `#BF1420` |
| meta | meta · tag (bracket chrome) | `#959597` | `#5C5C5E` |

Plain — punctuation, code, emphasis, strong, class — is the body colour
(`#E3E4E6` / `#2F2F31`). **Nothing is italic and nothing is bold**: the
reference colours tokens and never restyles them.

Four measured EXCEPTIONS, where nesting changes family:

```
.hljs-literal.hljs-keyword   → keyword   (JSON `true`)
.hljs-function .hljs-title   → keyword   (PHP function name)
.hljs-params .hljs-literal   → name
.hljs-params .hljs-built_in  → type      (Python)
```

The language menu is 176 wide with a `Filter…` field over 38 rows behind
`Auto detect`; picking is filter-then-Enter. Three rows — Cypher,
ReScript, Terraform — have no highlight.js grammar at all, so the
reference cannot be colouring them either.

### Light-theme prose values (measured, NOT the dark ones mirrored)

| token | light | dark |
|---|---|---|
| `pre` background | `#EFEFF0` (the app ground) | `#09090A` |
| `pre` border | `#E2E2E2` | `#2C2D2F` |
| inline-code wash | `rgb(0 39 118 / 0.051)` — blue-tinted | `rgb(255 255 255 / 0.075)` — flat |
| inline-code inset ring | `#D3D3D3` | `#3F4042` |
| blockquote rule | `#D3D3D3` | `#28282B` |
| checkbox border | `#9C9D9F` | `#565759` |
| checkbox checked fill | `#2F2F31` | `#E3E4E6` |

The quote rule and the code ring land on the SAME light value while
sitting two ramp steps apart in dark, and the inline wash changes hue,
not just alpha — mirroring the dark side would have been wrong in three
places.

### Ordered lists

A **grid**, not `list-style: decimal`: tracks `24px 1fr`, each `<li>` on
`subgrid`, marker via `content: counter(editor-ol) ". "`, `margin-top:
16`. That puts the number in the same 24px column as a bullet and a
checkbox, so mixed lists line up; a decimal marker hangs off the text
edge and drifts at double digits.

### The editable box

`padding: 10px 14px 384px 14px` with `margin: 0 -14px` — the two cancel,
so text keeps the 805 column while the editable area bleeds 14px each
side. The 384px foot is the click-to-focus runway below the last block.

## Image menu

`View image · Download · Copy image · Copy link · ─── · Add comment ·
Delete`, opened from the image's own hover control.

## Not measured

- The "Insert gif…" picker (a Linear service we do not have).
- The heading gutter control ("Heading actions", 20×20 r-4, 28px left of
  the text, horizontal ⋯ in `#959597`) — the glyph is extracted, its MENU
  contents are not. Paragraphs have no such control; only headings.
- `hljs` classes no grammar in the sweep produced: `doctag`,
  `template-variable`, `selector-attr`, `selector-pseudo`, `bullet`,
  `formula`. Left unstyled, which paints them the body colour.
- Whether the language menu marks the three rows it cannot highlight.
- The `Diagram` block.
- Image resize handles / alignment controls, if any.
- The comment gutter and the "Show comments" mode.
- Drag handles beside blocks (the reference's body editor is 833 wide vs
  the 805 title, which suggests a 28px gutter for them — not captured).

---

# The outline rail (measured)

`spec-bundle/extracted/linear-doc-minimap*.json`. Captured on a
3-heading document AND a 96-heading one — the long case is where the
behaviour is.

Appears only when the reference's sidebar is hidden (verified absent at
900/1000/1100/1200/1300 with the sidebar shown), i.e. when the gutter is
free.

| part | value |
|---|---|
| outer | `position: absolute; left: 0; top: 50%` of the scroll viewport, `translateY(-50%)`, `z-index: 11`, `padding: 4px 24px 4px 4px` |
| hover bridge | that 24px RIGHT padding — the pointer reaches the panel without leaving |
| window | `overflow: hidden`, height `min(railHeight, 0.75·vh − 78)` — reproduced 492 / 372 / 672 at vh 760 / 600 / 1000, exactly |
| fade | `linear-gradient(transparent 0, #000 24px, #000 calc(100% − 24px), transparent)` |
| rail | 8px column, one 8×12 slot per heading, `justify-content: flex-end` |
| slide | `translateY(−scrollFraction × (railHeight − windowHeight))`, `transition: transform` — a scrollbar mapping, matched within 1% at three viewport heights |
| dash | height 1; width IS the level — **h1 8 / h2 6 / h3 4** |
| active dash | `scaleY(2)` (not a taller box), colour `#E3E4E6`; inactive `#565759`, `transition: background .15s` |
| active rule | the last heading whose top ≤ viewportTop + 44; the FIRST when none has. Pinned by a 30px sweep |
| clicking a dash | **does nothing** — only the expanded panel navigates |

Expanded panel: menu ground, `0.5px` menu border, radius 8,
`padding: 10px 0`; rows 24 with `padding: 0 12px`; label indents
**0 / 12 / 24** by level, 13px/450; active `#E5E6E8`, resting `#626365`,
hover `#E5E6E8`, `transition: color .15s`.

A 96-heading rail renders ~47 dashes — it is virtualised.

# Heading gutter control (measured)

`aria-label="Heading actions"`, 20×20 radius 4 at 28px left of the text,
`padding: 0 2px`. Only HEADINGS have one; paragraphs have none. The glyph
is a horizontal ⋯ that **rotates 90° into a vertical ⋮ on hover**
(`transform: matrix(0,1,-1,0,0,0)`), hover fill `#161617`, icon `#FFFFFF`.
`draggable=false` — it drags via pointer events, and clicking it opens no
menu.

# Selection toolbar — the full row (measured)

525×35 on a paragraph selection, radius 8, `--menu-bg`, `0.5px #505154`,
shadow `lch(0 0 0/.3) 0 .5px 1px 1px`. **Fifteen** controls:

```
Regular text ▾ · Bold · Italic · Strikethrough · Underline · Link ·
Quote · Collapse · Inline code · Code block · List ▾ │
Move selection to new document · Create issue from selection ·
Ask agent · Comment
```

The two 42-wide controls are dropdowns; the rest are 26×26 on a 6px
pitch. There is exactly ONE divider, before the right-hand action group.
Icons rest at `#9C9D9F` and go `#E5E6E8` when the mark is active.

# Document header (measured)

44 tall, `padding: 0 12px 0 8px`, **`border-bottom: 0.5px #212224`**
(`--frame-border`).

# Restore dialog — colours (measured)

Switch on `#5E6AD2`; `Current` chip `padding: 1px 6px`, radius 3, border
`0.5px #505154`, bg `#242526`; Restore button 106×24 radius full brand.

## Not measured (this pass)

- The two toolbar dropdowns' MENU CONTENTS — the reference's toolbar
  would not stay open under CDP long enough to open them. Our rows come
  from the slash palette, which IS measured, with the same chords.
- The light-theme outline rail and panel colours, and the light
  `--toolbar-border`. Dark is measured; light uses tokens whose light
  values were measured on sibling surfaces.
- The change-highlight band colour in the restore dialog.
- The heading handle's DRAG (synthetic pointer events did not trip it).
- The code-block selection bubble ("Comment" only, no formatting bar).
