# Team overview + team icon/emoji/colour picker

Reference: `https://linear.app/test-workspace-bb/team/TES/overview`
Captured 2026-08-22, dark theme, viewport **1432×723**, signed in.
Bundle frames: `039-team-overview-base`, `040-team-icon-color-picker`.
Extracted data: `spec-bundle/extracted/linear-icon-symbols.json`,
`linear-team-icons.json`, `linear-emoji.json`, `linear-icon-picker-colour.json`.

Entry path for the picker: the crawler's `click` primitive does **not** open
it (`newSurfaces: []`, unchanged `page_describe`). It needs a real CDP
`mousePressed`/`mouseReleased` pair at the 36×36 "Choose team icon" tile,
centre **(356, 138)**.

---

## 1. Team overview page

Sidebar occupies x 0–221. All values measured, not derived.

| Element | Position / size |
|---|---|
| Header row | y = 16 |
| ☆ favourite | x = 388 |
| ⋯ Team actions | x = 420 |
| Copy team URL | x = 1388 (right-aligned) |
| Tab strip | y = 60 |
| — Overview | x = 229, w = 75 |
| — Documents | x = 312, w = 86 |
| — Members | x = 406, w = 75 |
| Body container | (221, 96), 1203 × 379 |
| "Choose team icon" tile | (338, 120), **36 × 36** |
| Team resources → Add resources | (976, 233), 28 × 28, `border-radius: 9999px` |
| Team resources → Add section | (1008, 233), 28 × 28, `border-radius: 9999px` |
| Right rail | x = 1079 |
| — Members avatar | (1082, 165), 18 × 18, `border-radius: 50%` |
| — Go to · Team settings | y = 279 |
| — Go to · Issues | y = 315 |
| — Go to · Cycles | y = 351 |
| — Go to · Projects | y = 387 |
| — Go to · Views | y = 423 |

"Go to" rows sit on a **36px pitch**. Content column + rail span
x 338 → 1300 (≈ 960 wide), centred in the 1203px body.

Round action buttons in "Team resources" have background
`lch(10.149 0.689 272)`.

---

## 2. Icon / emoji picker panel

Panel **412 × 411** at (338, 160). No border, no shadow, no radius on the
measured root — the chrome belongs to the popover wrapper, not this box.

### Tabs

y = 161, height 31. Text 13px / weight 500.

| Tab | x | w | colour |
|---|---|---|---|
| Icons | 347 | 50 | active `lch(91.178 1.425 272)` = `#e5e6e8` |
| Emojis | 401 | 57 | inactive `lch(64.714 1.425 272)` = `#9c9d9f` |

### Colour row — **Icons tab only**

The Emojis tab has no colour row (its search field moves up to y = 196).
Block at y = 192, `padding: 16px 0`. **Two states**, and the DEFAULT is the
presets — not the HEX field.

#### State 1 — presets (default)

Block is **54px** tall. Dots box is `357 × 22 @ (339, 208)`,
`justify-content: space-between`, `padding: 0 16px` → 9 dots at a **38px
pitch**, first at x = 355, last at x = 658. The conic wheel sits in a
separate absolutely-positioned box at x = 712, so both rows share the band.

Each dot: 22 × 22, `border-radius: 50%`, `border: 1px solid transparent`,
`box-shadow: transparent 0 0 3px 3px`, `transition: all`. The ring is
ALWAYS present and merely transparent when unselected — that is what makes
selection fade in rather than pop.

Dots carry the reference's own `aria-label`s:

| # | name | hex |
|---|---|---|
| 1 | Grey | `#bec2c8` |
| 2 | Dark Grey | `#95a2b3` |
| 3 | Purple | `#5e6ad2` |
| 4 | Teal | `#26b5ce` |
| 5 | Green | `#4cb782` |
| 6 | Yellow | `#f0bf00` |
| 7 | Orange | `#f2994a` |
| 8 | Pink | `#f7c8c1` |
| 9 | Red | `#eb5757` |

`lch()` values were converted through the page's own canvas
(`fillStyle` → `getImageData`), not by hand — CSS `lch()` is D50 and a hand
pipeline drifts.

**Selected** = `box-shadow: <the dot's own colour> 0 0 3px 3px` PLUS a check
laid over the fill: `<svg width=10 height=9 viewBox="0 0 10 8">` filled with
`lch(12.72% 0.85 272)` (`#212122`, the search-field ground), path

```
M3.46975 5.70757L1.88358 4.1225C1.65832 3.8974 1.29423 3.8974 1.06897 4.1225C0.843675 4.34765 0.843675 4.7116 1.06897 4.93674L3.0648 6.93117C3.29006 7.15628 3.65414 7.15628 3.8794 6.93117L8.93103 1.88306C9.15633 1.65792 9.15633 1.29397 8.93103 1.06883C8.70578 0.843736 8.34172 0.843724 8.11646 1.06879C8.11645 1.0688 8.11643 1.06882 8.11642 1.06883L3.46975 5.70757Z
```

#### State 2 — custom colour (the wheel)

Clicking the wheel (`aria-label: "Set custom color"` → becomes
`"Select default color"`) grows the block to **170px** and replaces the dots
with:

- **HEX row** `379 × 22 @ (355, 208)`, `padding-right: 20px`,
  `margin-bottom: 16px` — current-colour dot, then the label `HEX`
  (13px/500, `lch(41.778 1.425 272)`, `margin-left: 12px`), then a 298 × 16
  value input. The group carries **`transition: opacity 0.35s`**.
- **Saturation/value** `<canvas> 350 × 100`, `border-radius: 4px`. Handle
  16 × 16, `border-radius: 10px`, `border: 1px solid #fff`,
  `box-shadow: rgba(0,0,0,.5) 0 0 4px`, filled with the current colour.
- **Hue slider** `<canvas> 6 × 100`, `margin-left: 16px`,
  `border-radius: 4px`. Handle 12 × 4, `border-radius: 2px`,
  `background: rgba(255,255,255,0.7)`, `border: 0.5px lch(34.32 1.93 272)`,
  `box-shadow: rgba(0,0,0,.5) 0 1px 2px`.
- Same `transition: opacity 0.35s` on the canvas group. **This fade is the
  "apply" animation.**

Wheel sweep:
`conic-gradient(rgb(235,87,87), rgb(242,201,76), rgb(76,183,130), rgb(78,167,252), rgb(250,96,122))`

Default team colour: **`#00aaff`**. Default team icon: **`Team`**.

#### Chrome measured on the panel

| part | value |
|---|---|
| tab row | `411 × 32`, `padding: 0 8px` |
| tab button | `padding: 7px 8px`, `margin-right: 5px`, 13px/500 |
| active tab | `box-shadow: #6975e2 0 -1px 0 0 inset` — a 1px accent UNDERLINE, not a filled pill |
| hairline above search | `411 × 1`, `border: 1px lch(17.04 1.93 272)` = `#292a2d` |
| search field | `395 × 28`, `padding: 6px 28px 6px 8px`, `background #212122`, `radius 8px`; wrapper `padding: 5px 8px` |
| grid scroller | `padding: 8px 10px`, `overflow: auto`, **virtualized** (inner 391 × 714, rows absolutely positioned) |
| grid cell | 28 × 28, `padding: 6px`, `border-radius: 9999px` (round), `transition: border, background-color, color, opacity` |
| panel ground | `lch(5.52 0.4 272)` = `#121213` |

### Search

Icons tab: `Search icons…`, w = 395. Emojis tab: `Search emoji…`, w = 401,
y = 196.

### Grid — identical geometry on both tabs

- **14 columns**, **28px cell pitch** (both axes)
- Icons render **14px** on a `0 0 16 16` viewBox
- Emoji render at **font-size 19px**
- Icon column x positions: 356, 384, 412 … 720
- Category heading rows are **28px** tall, 12px / weight 500,
  `lch(64.714 1.425 272)`

The **Icons** tab is ONE flat list with **no category headings** — the
order *is* the grouping. The **Emojis** tab has nine headings.

---

## 3. Icon catalogue

**271 icons**, delivered as `<use href="#Name">` against an in-document
`<symbol>` sheet (301 symbols total; the extra 30 are app chrome, not
picker entries). Every symbol is `viewBox="0 0 16 16"`.

`Cookie` appears in the grid but has **no symbol** in the sheet — it
renders blank in the reference too. Dropped from our catalogue.

Curated order (this is the grouping, preserve it):

```
Team · faces (Face…FaceId) · Users Mask Shrug Signature FootPrint
Accessibility Dna · health (Heart…Bones) · ThumbsUp ThumbsDown ·
food (Burger…Ramen) · nature (Leaf…Dino) · sport (AmericanFootBall…Jersey)
· Dice PokerCard · music (Mic…Boombox) · tools (Cone…Brick) ·
objects (Book…Recycle) · Hourglass Megaphone Chemist ·
navigation (Direction Compass Pin) · travel (Airplane…MovingStaircase) ·
world (World Africa…SouthAmerica Moon) · places (Tower…Cart) · Judge Hack ·
tech (MacOS…CodeBlock) · UI (Speedometer…WritingAI) ·
brands (Android…Zendesk) · money (Bank…Solana) ·
status (IssueStatus* MilestoneStatus* MyIssues Project Initiative Automation)
```

**Our addition:** `Protocolbase`, seated in the brand run immediately
before `Linear` (glyph from `components/brand-logo-mark.tsx`, viewBox
`0 0 1024 1024`, `fill="currentColor"` — the chip is dropped so the mark
tints like every other catalogue icon). Total shipped: **272**.

Sheet: `public/team-icons.svg`, 189KB raw / **53KB brotli**.

---

## 4. Emoji catalogue

**1846 glyphs**, nine categories, shortcode names (`+1`, `ok_hand`,
`flag-ac`) which are what the search field matches.

| Category | count |
|---|---|
| Frequently used | 23 |
| Smileys & People | 506 |
| Animals & Nature | 144 |
| Food & Drink | 132 |
| Activity | 85 |
| Travel & Places | 218 |
| Objects | 255 |
| Symbols | 214 |
| Flags | 269 |

Harvest note: classifying a cell as emoji by regex (`Extended_Pictographic`)
**silently loses 311 glyphs** — regional-indicator flags and ZWJ sequences
fail the test and get mistaken for category headings. Classify
**geometrically** instead: a grid cell is ≤ 28px wide, a heading is not.

---

## 5. Overview menus + the resource tree

All measured live in the test workspace (rows created and deleted freely).

### ⋯ Team actions  (`spec-bundle/extracted/menu-Team-actions.json`)

Menu shell `175 × 121`, `background lch(12.72 0.85 272)` = `#212122`,
`radius 12`, `border 0.5px lch(25.68 1.93 272)`,
`box-shadow: lch(0 0 0 / .125) 0 3px 8px`, `position: fixed`. It carries a
hidden `Filter…` input — the menu is type-to-filter — and a virtualized
`<ul>` of absolutely-positioned rows.

Row `174 × 32`, `padding: 0 18px 0 14px`; the hover highlight is an inner
`162 × 32` block at `radius 8`; content `142 × 16`, flex, `gap: 8`.
Separator block `174 × 12`, `padding: 6px 0`, around a 1px line.

Items: **Team settings** · **Open archive** · ─── · **Leave team…**

### Add resources  (`menu-Add-resources.json`)

Menu 201 wide. Items: **New document** · **Existing documents ▸**
(submenu, icon `#Page`) · ─── · **New link…**

### Add section

NOT a menu. Clicking it creates a section row immediately and focuses an
inline `<input placeholder="Section name">`, `108 × 24`, **15px/600**,
transparent, `radius 8`.

### Populated section

Section block `flex column gap:8`, `padding: 6px 0`, `radius 8`.
Header row `698 × 24`, `margin: 0 2px 0 12px`, `gap: 8`:

| part | value |
|---|---|
| name | 15px/600, `line-height 23`, `lch(90.451 1.2 272)` |
| collapse | 16 × 16, fully round, `aria-label="Collapse section"` |
| divider | 1px, **fills the remaining width** (`625 × 1` here), `lch(13.08 1.48 272)` |
| ⋯ | 24 × 24 fully round, `aria-label="Open menu"`, hover-revealed (its container is 0 wide at rest) |

Section-header action buttons (`Add resources` / `Add section`) are
28 × 28, fully round, **`background lch(10.149 0.689 272)`**,
`border 0.5px transparent`, `padding: 0 2px`,
`transition: border, background-color, color, opacity` @0.15s.

Add-row inside a section: `119 × 24`, `padding: 0 8px 0 6px`, fully round,
14px icon + label.

### ☆ favourite  (`star-states.json`)

Two DIFFERENT paths, not one glyph with a fill swap:
`Add to favorites` (outline, `lch(90.451 1.2 272)`) ⇄
`Remove from favorites` (filled, `lch(100 0 272)`).

### New link dialog

Two full-width fields, `475` wide: `https://…` then an untitled second
field (the title).

---

## 5b. Corrections to earlier passes

Three things in sections 1–2 above were measured off the WRONG element on
a first pass. The values here supersede them.

### Tabs are PILLS, not underlined text

The `75×28` boxes are wrappers; the painted element is an `<a>` with
`border-radius: 9999px` and — critically — **both states are filled**:

| state | fill |
|---|---|
| selected | `lch(16.706 .979 272)` = **`#29292b`** |
| rest | `lch(10.149 .593 272)` = **`#1c1c1d`** |

Label 12px/500 with 10px side padding, 8px gap between pills. There is no
underline anywhere on this strip. (The 1px accent underline DOES exist,
but on the icon-picker's Icons/Emojis tabs — a different control.)

### A favorited ☆ is GOLD

`fill: lch(80 90 85)` = **`#f0bf00`** — the same hue as the picker's
Yellow preset. Unfavorited is `lch(90.451 1.2 272)`. Two different PATHS,
outline vs filled, not one glyph with a fill swap.

### Menu chrome

| part | value |
|---|---|
| ground | `lch(12.72 .85 272)` = `#212122` — lighter than a popover panel (`#121213`) |
| radius | 12 |
| border | `0.5px lch(25.68 1.93 272)` = `#3c3d40` |
| shadow | `lch(0 0 0 / .125) 0 3px 8px`, + a second stop |
| min width | 174 |
| list padding | 6px top/bottom |
| row | `174 × 32`, `padding: 0 18px 0 14px`, content gap 8 |
| row highlight | inset `162 × 32`, `radius 8`, `lch(20.82 1.3 272)` = `#313234` |
| label | 13px/**450**; rest `#e3e4e6`, highlighted `#ffffff` |
| icon | 16px, rest `#959597` |
| separator | 1px line inside a 12px block (`padding: 6px 0`) |

The row highlight is NOT the sidebar row wash (`#1D1D1F`) — menus and rows
are different surfaces in the reference.

### Grid cells differ by tab

| | icon cell | emoji cell |
|---|---|---|
| padding | 6px | **0** |
| radius | 9999px | **8px** |
| glyph | 14px svg, filled with the selected colour | 19px on a 20px line box |

`aria-label` is the icon id (`Rocket`) or the emoji shortcode (`+1`,
`ok_hand`) — ours match exactly.

### Link modal

Container 539 wide, `padding: 32px`. Fields `475 × 32`, `radius 8`,
`padding: 6px 12px`, ground `#212122`, 13px. Buttons are **32px PILLS**,
13px/500: Cancel `lch(17.349 1.139 272)` = `#2a2b2c`, primary
`lch(47.918 59.303 288.421)` = `#5e6ad2` labelled **"Add link"**, not
"Save".

### Menus, full item sets

- **⋯ Team actions** — Team settings · Open archive · ─── · Leave team…
  (NOT red).
- **Add resources** — New document · Existing documents ▸ · ─── ·
  New link…
- **Existing documents ▸** — a `Search documents...` field over a
  date-grouped ("Today") list of checkable rows.
- **Section ⋯** — Add resources ▸ · Copy link · Rename… · ─── · Delete.
- **Add section** is NOT a menu: it creates the row and focuses an inline
  `Section name` field (15px/600, transparent, radius 8).

### Populated section anatomy

Header `698 × 24`, `margin: 0 2px 0 12px`, gap 8: name 15px/600
`lch(90.451 1.2 272)` · 16px collapse chevron · **a 1px divider that fills
the remaining width** (`lch(13.08 1.48 272)` = `#212224`) · a 24×24 ⋯
revealed on hover. Header round actions carry a
`lch(10.149 .689 272)` = `#1b1c1d` fill.

### Rail interactions

The members pill and each "Go to" row reveal a trailing chevron on hover;
the "Add members" `+` appears with them. All opacity-only over reserved
space.

---

## 6. Not measured

Everything below was seen but not captured; do not guess these.

- **Light theme.** Every value in this file is dark-only. This is the
  largest remaining gap.
- **Hover / focus / active matrices.** `capture_css_spec` was never run
  against this page, so every hover wash in our build is the house
  `foreground/10` rather than a measured value.
- **"Existing documents ▸" submenu** under Add resources — the parent row
  is measured, the submenu was never opened. We ship neither it nor
  "New document": documents are a separate surface here and a row that
  opens nothing is a dead affordance.
- **Drag-reorder** of resources and sections. The rows carry fractional
  sort keys and `moveResource` exists in the core, but no drag affordance
  is wired and the reference's drag behaviour was not captured.
- **Team description.** The reference has an inline contenteditable slot
  (`688 × 23`, 15px/450) under the title; organizations have no
  description field here, so it is not rendered.
- **Members rail beyond the strip** — the "Add members" popover and the
  avatar-pill's own hover/expanded states.
- **The reference's collapsed-sidebar header.** `Cmd+.` did not toggle
  over CDP and no toggle is exposed in its DOM, so our sidebar trigger's
  placement is our own choice.
- **Documents and Members tabs** — only Overview was visited.
- **Panel and menu entry/exit animation**, if any.
- **Keyboard model** of the icon grid — our arrow-key roving focus is our
  own choice, not a measured behaviour.
- **What happens to a team's mark when the workspace has an uploaded
  logo** — the reference has no logo concept, so precedence is our call.
