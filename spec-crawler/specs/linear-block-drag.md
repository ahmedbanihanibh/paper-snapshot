# Linear — document block drag (the carried preview and the insertion line)

Captured 2026-08-27, Chromium (Edge on :9222), LIGHT theme, viewport
1432×723, on `linear.app/test-48bd-dd25/document/example-document-…`.
Source block: the mermaid flowchart, **717px tall**, 805px wide, in a
content column starting at x=420.

Scripts (scratchpad): `drag-mech.mjs` (mechanism), `drag-native.mjs`
(indicator + staged preview), `drag-image.mjs` (the `setDragImage`
argument), `indicator-themes.mjs` (which variable, and its dark value).

---

## THE MECHANISM — read this before writing another drag probe

Linear's block drag is **native HTML5**. The handle's own element carries
`draggable="true"`:

```
handle chain: DIV[draggable=true] › DIV › DIV › …
```

Two consequences that cost six failed captures before they were noticed:

1. **`Input.dispatchMouseEvent` cannot begin a native drag.** Press, move
   and release all dispatch fine and nothing happens. The observation
   "Linear shows no drag preview" was therefore a fact about the probe,
   not about Linear. A mouse-driven drag probe on a `draggable` element
   is always a false negative.
2. **A native drag's preview is a browser drag IMAGE, not a DOM node**, so
   a DOM diff across the gesture cannot see it either — a second, quieter
   false negative underneath the first.

What works: patch `DataTransfer.prototype.setDragImage` to record its
argument, then dispatch a real `new DragEvent("dragstart", {dataTransfer})`
on the draggable ancestor. Linear's own handler runs and hands you the
preview element. Drive `dragenter`/`dragover` the same way for the
indicator, and finish with **`dragend`, never `drop`**, so the reference
document is not reordered. (Verified: `order intact: true`.)

Same family as the WebKit `-webkit-user-drag` trap — an input mechanism
one layer supplies and another requires you to address explicitly.

---

## The carried preview — CAPPED, which is the whole finding

`setDragImage(el, 10, 10)` — the cursor sits 10px in from the preview's
top-left corner.

The element passed is staged off-screen at (-324, 1446) and measures
**81 × 300** for a **717px** source:

| Part | Measured |
|---|---|
| outer wrapper | `position: relative`, 81.086 × 300 |
| card | `width: 81.0862px; height: 300px` |
| card background | `lch(97.94 0.5 282)` → `#F9F9FA` |
| card border | `1px solid lch(84.44 0 282)` → `#D3D3D3` |
| card radius | `4px` |
| card shadow | `lch(0 0 0 / 0.03) 0px 2px 8px` |
| card overflow | `hidden` |
| card layout | `display:flex; align-items:center; justify-content:center` |
| inner svg | `max-width: 73.0862px; max-height: 292px; width:100%; height:100%` |
| svg viewBox | `0 0 212 847`, `preserveAspectRatio="xMidYMid meet"` |

**The rule that falls out of those numbers:** the content is clamped to
**292px of height** inside a **4px inset** (300 − 292 = 8 = 4 top + 4
bottom), and the WIDTH is whatever the aspect ratio then gives —
`292 × 212/847 = 73.086`, exactly the measured `max-width`; the card is
that plus the same 8px, `= 81.086`. Height is the constrained axis; width
follows.

So Linear carries a **real miniature of the block**, and it can never
cover more than a 300px band however tall the source is. That is the
answer to "does it show the item while dragging, or only a coloured drop
line" — it shows the item, scaled.

## The insertion indicator

Captured at three drop depths:

| Over | Indicator box |
|---|---|
| a paragraph | `805 × 2` at x=420, y=781 |
| an `H2` | `805 × 2` at x=420, y=1161 |
| a narrow trailing block | `285 × 2` at x=420, y=1372 |

Constant across all three:

| Property | Value |
|---|---|
| `position` | `absolute` |
| `z-index` | `50` |
| `height` | `2px` |
| `border-radius` | **`0px`** |
| `background` | `lch(64.64 1.25 282)` → **`#9C9D9F`** |
| `border` / `box-shadow` | none |
| left edge | `420` — the content column's left, not the block's |
| width | the TARGET block's width, not a fixed value |

The fill is Linear's own `--color-text-quaternary`, its faintest text
role — **not** the primary accent, and **not** a rounded pill. The line
marks a position; the carried block is what holds the eye.

---

## What we shipped against this

- `CARRIED_PLATE_MAX_CONTENT = 292` in `components/dnd/carried-plate.ts`,
  applied by `components/rich-text/block-handle.tsx`. Ours scales a LIVE
  clone (`transform: scale(k)`, `transform-origin: top left`) rather than
  rasterising, keeping this module's existing rule that the plate
  re-renders and follows the theme.
- `--drop-indicator: #9C9D9F` in both theme blocks of `app/globals.css`;
  the drop line lost `bg-primary rounded-full`.

Drive gate, Chromium, `scratchpad/ours-drag.mjs`, on a source forced to
720px (layout only, restored after):

```
plate  : 292 tall, 326 wide, overflow hidden, transform matrix(0.405556…)
         0.405556 = 292/720 ; 805 × 0.405556 = 326      → aspect preserved
line   : 2px tall, radius 0px, rgb(156,157,159) = #9C9D9F, pointer-events none
teardown: plate false, line false, order intact
```

---

## Not measured

- **Dark theme. RETRACTED — this previously said the value was
  corroborated in dark; it was not.** That claim came from flipping the
  reference's theme CLASS and re-reading the variable. A later capture
  proved the class flip does not repaint Linear at all: the "dark" read
  came back byte-identical to light because nothing had changed. Linear
  follows `prefers-color-scheme`, and the only thing that switches it is
  CDP `Emulation.setEmulatedMedia({features:[{name:"prefers-color-scheme",
  value:"dark"}]})` — verified, the menu surface goes `#FFFFFF` → `#212122`
  under it. The indicator itself has still NOT been read in dark: the
  attempt failed because the diagram predicate (`svg[id^="mermaid"]`) does
  not match — the real id is `svg-diagram-<uuid>`. The preview CARD's three colours
  (`#F9F9FA` / `#D3D3D3` / the 3% shadow) were captured in LIGHT ONLY and
  almost certainly differ in dark; we did not adopt them (see below), so
  nothing currently depends on them.
- **The drag image at other block types.** Only the diagram (717px) was
  dragged. A tall CODE block or a long list may or may not use the same
  292 clamp; the cap is a height rule, so it should, but it is untested.
- **WebKit.** Our drag is pointer-based, not native HTML5, so the
  `-webkit-user-drag` trap does not apply — but the scale transform on
  the carried clone has not been looked at in Safari.
- **What happens past `dragover`.** We deliberately never dispatched
  `drop` against the reference, so the drop animation / settle is
  uncaptured.

---

# Block handle INVENTORY — which blocks have one, and what its menu holds

Captured 2026-08-27, same session and document, Chromium, light.
Scripts: `menu-inv.mjs` (open each type's menu, inventory rows),
`gutter-hover.mjs` (hover the text vs the gutter column),
`wiggle.mjs` (real pointer movement across the block into the gutter).

## Only TWO block types have a gutter handle

| Block type | Handle | `aria-label` |
|---|---|---|
| heading 1 | yes | `Heading actions` |
| heading 2 | yes | `Heading actions` |
| diagram | yes | `Diagram actions` |
| paragraph | **none** | — |
| empty paragraph | **none** | — |
| bullet list | **none** | — |
| ordered list | **none** | — |
| todo list | **none** | — |
| quote | **none** | — |

Every handle sits at **x = 392**, 20×20, in a content column starting at
420.

**How hard this negative was to establish**, because a negative from a
probe is normally worthless: three independent runs, and the second one
disagreed with the first on `heading2`, which proved the reading was
timing-sensitive and that any single "none" was untrustworthy. Two
mechanisms were then ruled out explicitly —

- *stale rect*: the hover point was recomputed AFTER the scroll settled,
  not before (a rect read pre-scroll lands the pointer tens of px off and
  reads as "no handle");
- *teleport vs movement*: Linear could plausibly mount paragraph handles
  from a document-level `mousemove` tracker that a single dispatched move
  never triggers. So the final pass parks the pointer far away, then
  WIGGLES in ~18px steps across the block and into the gutter — genuine
  movement with deltas.

Under that method both headings and the diagram report their handles on
every run, and the paragraph family reports none on every run. That is
what makes the absence a measurement rather than a miss.

## The two menus, in full

**`Heading actions`** — 2 rows, row height 28, menu content width 139:

1. Copy link
2. Make collapsible

**`Diagram actions`** — 5 rows, row height 28, menu content width 122:

1. Copy link
2. Copy diagram
3. Copy source
4. Select
5. Delete

No row reports `aria-haspopup`, so neither menu has a submenu.

## Not measured

- **The menu SURFACE chrome.** The probe's "widest fresh element" landed
  on a full-viewport overlay (1432×723, transparent), so the popover's
  own background, radius, border, padding and shadow are NOT captured.
  Row heights and widths above are real; the container around them is
  not. Capture with `capture_component` before building the chrome.
- **Row icons.** The inventory records each row's first `path` `d`, but
  they were not extracted as usable SVGs, and no row's icon has been
  diffed against ours.
- **Dark theme** for both menus.
- **Block types absent from the reference document**: code block, image,
  table, divider, toggle/collapsed heading. Whether THOSE get a handle is
  unknown — the finding above covers only the nine types present.
- **What replaces the handle** for paragraphs and lists: whether Linear
  offers drag reordering of a paragraph by some other affordance
  (right-click menu, keyboard, selection drag) was not tested.

---

# The handle menu's CHROME — surface, rows, icons, filter, and the missing wash

Captured 2026-08-27, Chromium, on the `Heading actions` menu (2 rows).
Scripts: `menu-chrome.mjs` (light surface), `menu-tree.mjs` (subtree),
`menu-final.mjs` (dark + icons + filter), `wash-final.mjs` (the wash).

## How to switch Linear's theme — the only method that works

Linear follows **`prefers-color-scheme`**. Flip it with CDP:

```js
Emulation.setEmulatedMedia({features:[{name:"prefers-color-scheme",value:"dark"}]})
```

Verified: the menu surface goes `#FFFFFF` → `#212122` under it, and
`document.documentElement.className` becomes `dark`.

**What does NOT work, and produced a false "dark" measurement earlier in
this session:** adding/removing Linear's own theme class
(`classList.add("theme-dark")`, `data-theme="dark"`). The page does not
repaint; every value comes back byte-identical to light, which reads as
"this value is the same in both themes" and is really "nothing happened".

**It also LATCHES.** After an emulated-dark session Linear writes
`localStorage.darkMode = "true"` (`website-theme` stays `system`), and
clearing the emulation does not undo it — the browser stays dark until
`darkMode` is rewritten and the page reloaded. Any probe that emulates
dark must restore this, or it leaves the user's browser in dark.

## Surface

| | light | dark |
|---|---|---|
| box | 168.23 × 73.5 | 168.23 × 73.5 |
| background | `#FFFFFF` | `#212122` (`lch(12.72 0.85 272)`) |
| radius | `10px` | `10px` |
| padding | `4px 0px` — vertical only | `4px 0px` |
| border | `0.5px solid lch(86.5 0 282)` | `0.5px solid lch(34.32 1.93 272)` |
| shadow | `lch(0 0 0/.02) 0 6px 18px, lch(0 0 0/.04) 0 3px 9px, lch(0 0 0/.04) 0 1px 1px` | `lch(0 0 0/.125) 0 3px 8px, lch(0 0 0/.125) 0 2px 5px, lch(0 0 0/.125) 0 1px 1px` |
| text colour | `#303032` | `#E5E6E8` |

Three-layer shadow in both, but **different alphas and offsets** — dark is
tighter (3/2/1) and four times as strong (.125 vs .02/.04). Not derivable
from the light values.

## Row anatomy

```
surface  DIV  168.23 × 73.5   radius 10   padding 4px 0
 └ DIV   167.2 × 64.5         (transparent)
    ├ DIV 0 × 0.5  grid       ← collapsed host for the filter input
    │   └ INPUT 28 × 32       placeholder "Filter…", AUTOFOCUSED on open
    └ DIV 167.2 × 64
       ├ DIV 167.2 × 32       padding 0 14px, flex, gap 8px   ← ROW
       │   └ DIV 139.2 × 28   padding 6px 12px 6px 0          ← row content
       └ DIV 167.2 × 32  …    ← second row, same shape
```

- Row pitch **32px**, full surface width, **14px** horizontal padding.
- Type **13px / 19.5px / weight 400**.
- Icons **16 × 16**, flush at the row content's left edge (`dx 0`), gap 8px
  to the label. Fill: light `lch(40% 1 282)`, dark `#9C9D9F`.
- The active row carries **`data-active="true"`** (JS-driven, not `:hover`).

## The row hover plate — MEASURED IN PIXELS (an earlier "no plate" was WRONG)

| Property | Measured (light) |
|---|---|
| fill | **`#F0F0F0`** |
| box | **159 × 32** — the full row height |
| inset | **4px** left and right inside the 167.23 row box (x 248 → 406 within 244 → 411) |
| radius | **≈4–5px** (left edge reaches full extent 5 scanlines down, right edge 4) |
| row spacing | **none** — row 1 ends y 428, row 2 begins y 429 |
| trigger | `data-active="true"` on the row (JS-driven, not CSS `:hover`) |

### How this was got wrong first, because the mechanism matters

Two DOM methods agreed there was no plate: `CSS.forcePseudoState` forcing
`:hover`, and a real pointer path producing `data-active="true"` — then
enumerating **every** descendant of the surface for a non-transparent
`backgroundColor` or a `backgroundImage`. One hit: the surface. I wrote
that up as "Linear's block-handle menu rows have no hover wash", and noted
it contradicted our house menu rule.

It was wrong. **A plate can be painted by an inset `box-shadow`**, and a
scan of `backgroundColor` / `backgroundImage` cannot see that. Two
independent DOM methods agreed with each other because they shared the
same blind spot — agreement between methods that share an assumption is
not corroboration.

The pixels settled it in one pass: `Page.captureScreenshot` with a `clip`
over the open menu, decoded with a pure-Python PNG reader, then scanning a
**text-free column** and a **row** across the element. That gives the
band's exact extent, inset and corner radius — none of which computed
styles would have provided even if the background had been readable.

Standing rule, now in `CLAUDE.md`: when the DOM says "nothing paints", go
to pixels before writing it down.

### So the house rule holds after all

Our menu anatomy — inset row plates rather than a full-bleed wash — is
what the reference does here too. The insets differ (4px here vs our 6px
list padding) and the radius is ~4–5 rather than 8, so the values are not
identical, but the SHAPE is the same and there is no contradiction to
escalate. #116 builds to these numbers.

## Not measured

- ~~Whether the row paints at the pixel level.~~ **DONE** — see the plate
  section above. (The first screenshot attempt failed on my own bug:
  `send()` resolves the whole CDP message, so the base64 is at
  `result.data`, not `.data`. An `undefined` data URI fails as an image
  `onerror`, which looked exactly like a CSP block on `data:` and was
  briefly recorded as one. It is not a CSP issue.)
- The `Diagram actions` menu's chrome — only its ROW INVENTORY is
  captured. It is assumed to share this surface, unverified.
- The filter input's behaviour: it is autofocused and takes text, but what
  it filters, whether it fuzzy-matches, and what the no-match state shows
  are untested. (Relevant to #33.)
- Keyboard: arrow-key movement of `data-active`, Enter, and whether Escape
  closes the menu or navigates the document (Escape is dangerous here —
  see the procedure notes).

---

# BUILD SPEC — both handle menus, complete, both themes

Everything below is measured (`scratchpad/cover-all.mjs`, `png.py`,
`corner.py`). Light and dark captured via
`Emulation.setEmulatedMedia({features:[{name:"prefers-color-scheme",…}]})`.

## Surface — identical chrome for both menus

| | light | dark |
|---|---|---|
| background | `#FFFFFF` | `#212122` |
| border | `0.5px solid lch(86.5 0 282)` | `0.5px solid lch(34.32 1.93 272)` |
| radius | `10px` | `10px` |
| padding | `4px 0` (vertical only) | `4px 0` |
| shadow | `lch(0 0 0/.02) 0 6px 18px`, `lch(0 0 0/.04) 0 3px 9px`, `lch(0 0 0/.04) 0 1px 1px` | `lch(0 0 0/.125) 0 3px 8px`, `lch(0 0 0/.125) 0 2px 5px`, `lch(0 0 0/.125) 0 1px 1px` |

Width is content-driven: **168.23** for `Heading actions`, **151.35** for
`Diagram actions`. Height: 73.5 (2 rows) and 180 (5 rows + a separator).

## Row

| Property | Value |
|---|---|
| height | **32** |
| width | full surface width less the borders (167.23 / 150.35) |
| padding | `0 14px` |
| type | `13px / 19.5px`, weight **400** |
| label colour | light `#303032` · dark `#E5E6E8` |
| icon | **16 × 16** at `dx 14` (i.e. flush with the row padding), gap **8px** to the label |
| icon fill | light `#5E5E60` · dark `#9C9D9F` |
| rows | ABUT — no vertical gap (row 1 ends y 428, row 2 starts y 429) |

### The active-row plate — pixel-measured

| | light | dark |
|---|---|---|
| fill | `#F0F0F0` | `#353537` (composited over the surface) |
| box | 159 × 32 | 159 × 32 |
| inset | 4px left and right inside the row | same |
| radius | ≈ 4–5px | same |

Triggered by **`data-active="true"`** on the row — JS-driven, not CSS
`:hover`. The dark value is the composited pixel, not a token: it may be
an alpha over `#212122`, which a screenshot cannot decompose.

## Inventories

**`Heading actions`** (h1 and h2 share it) — 2 rows:
1. Copy link
2. Make collapsible

**`Diagram actions`** — 5 rows with a **separator before the last**:
1. Copy link
2. Copy diagram
3. Copy source
4. Select
5. *— separator, 11px —*
6. Delete

The separator is measured, not assumed: rows sit at y 339 / 371 / 403 /
435 (a 32 pitch) and Delete at **478** — a 43 gap, i.e. 32 + 11.

## Behaviour

- **Keyboard**: `ArrowDown` / `ArrowUp` move `data-active`. **No wrap** —
  a second `ArrowDown` on the last row leaves it there.
- **A filter input**: `<input placeholder="Filter…">` in a collapsed
  `0 × 0.5` host, **autofocused when the menu opens**.
- **Escape closes the menu AND NAVIGATES OUT of the document** to
  `/team/<TEAM>/documents` — one Escape did both (measured;
  `urlChanged: true`). **Do not clone this half.** Dismissing a menu
  should not leave the document. It is also the cause of an earlier
  capture cascade in this session, where a probe's Escape silently moved
  the page and every later reading came back empty.

## Not measured

- **What the filter input actually filters.** It is autofocused and it
  accepts focus, but three input methods failed to change its value:
  `dispatchKeyEvent` with `text`, `dispatchKeyEvent` with key+code+keyCode,
  and `Input.insertText`. So the mechanism was ruled out three ways and the
  behaviour is genuinely unread — not "the capture came back empty".
- Whether the dark plate is an alpha over the surface or a solid token.
- The row icons are captured as full SVG markup but have not been diffed
  against ours, and no icon has been extracted into a component yet.
- `Delete`'s destructive treatment: it renders with the same `#303032` /
  `#E5E6E8` label as every other row and no red — worth re-checking on
  hover, which was not captured for that row specifically.

## The preview card's chrome — MEASURED IN BOTH THEMES (2026-08-28), adopted

The `Not measured` entry above is closed. The dark half was captured the
same way as the light one: the preview is a browser bitmap, so the values
exist only on the element Linear hands to `setDragImage`, which is caught
by patching that method before dispatching a real `DragEvent`.

| | Light | Dark |
|---|---|---|
| radius | `4px` | `4px` |
| border | `1px solid #D3D3D3` (`lch(84.44 0 282)`) | `1px solid #28282B` (`lch(16.32 1.48 272)`) |
| background | `#F9F9FA` | `#121213` (`lch(5.52 0.4 272)`) |
| shadow | `0 2px 8px rgba(0,0,0,0.03)` | `0 2px 8px rgba(8,8,8,0.15)` |
| overflow | `hidden` | `hidden` |

**The themes are not one card re-toned.** The shadow is 3% in light and
**15%** in dark — a 5× difference. Deriving dark by inverting light, which
is the shortcut this repo has been burned by before, would have produced a
shadow nobody could see. This is why the rule is to capture both.

Adopted as `[data-drag-plate="block"]`, a VARIANT beside the existing row
plate rather than a replacement for it: a carried list row (favourites
rail, team resources) really is radius 8 on a lifted ground with the
three-layer ring-less shadow, and a carried document block really is this
card. Two surfaces, two captures, both kept.

lch() converted to hex colorimetrically (Lab→XYZ D50→Bradford→sRGB), never
eyeballed — Lightning CSS silently drops `lch()` from custom properties.

Drive-verified on our build mid-gesture, both themes:

```
dark   radius 4px  border 1px solid rgb(40,40,43)   shadow rgba(8,8,8,.15) 0 2px 8px
       bg rgb(18,18,19)    overflow hidden  pointer-events none  teardown clean
light  radius 4px  border 1px solid rgb(211,211,211) shadow rgba(0,0,0,.03) 0 2px 8px
       bg rgb(249,249,250) overflow hidden  pointer-events none  teardown clean
```
