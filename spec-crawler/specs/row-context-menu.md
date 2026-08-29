# Row ⋯ context menu + its three submenu shapes

The per-row overflow menu on a Linear document row, and the three structurally
different submenus that hang off it. This is the primitive PB's per-row `⋯`
rail, right-click menus and every "pick a thing" popover must match.

- **Captured**: 2026-08-22, live `linear.app`, Edge over CDP, viewport 1432×723,
  **dark only**.
- **Entry path**: team `Teeeee` (key `EMP`) → **Documents** tab → hover the
  `Hello Document 1` row → click the trailing **`Open menu`** button (32×32,
  revealed on row hover at the row's right edge, row is 1179×48 at y 166).
- **Bundle ids**: `035-049` (menu), `036-050` (Move to), `037-051` (Copy),
  `038-052` (Remind me).
- **Paper**: `18H4-0`, `18LR-0`, `18NY-0`, `18QD-0` on page `3-0`, row y = 2569.
  All four verified visually in Paper after import.

## The state hook is `data-focused`, not `:hover` and not `aria-selected`

This corrects the note in `pb-paper-frame-inventory.md`, which said selection is
`aria-selected`. On these menus **every row reports `aria-selected="false"`**,
including the highlighted one. The real attribute is:

```
<li role="option" data-list-row="true" data-focused="true" aria-disabled="false" …>
```

`data-focused` tracks pointer AND keyboard in one attribute — moving the mouse
moves it, arrowing moves it, and only ever one row carries it. A CSS `:hover`
rule cannot reproduce this: hovering a second row while the keyboard cursor sits
elsewhere would light two rows. Build the row so the highlight reads a prop, and
drive that prop from a single "focused index" the pointer and the keyboard both
write to.

## Container

```
rect        231 × 368 (fits content; grows with rows)
background  lch(12.72 0.85 272)
radius      12px
border      0.5px solid lch(25.68 1.93 272)
padding     0            ← NOT on the container
overflow-y  auto, max-height none
```

The `role="listbox"` element itself has **zero padding and zero radius**; the
12px radius and the fill live on its popper wrapper. The 6px of breathing room
at the top and bottom of the list is a **6px spacer `<div>`**, first and last
child — not padding. Copy that: it means a scrolled list clips flush at the
rounded edge instead of showing a padding band.

### Two elevations, not one

The flat menu and its submenus carry **different** shadows. This is the
elevation ladder and it is worth reproducing exactly — the submenu must read as
sitting on top of the menu, not beside it.

```
depth 1 — the menu            lch(0 0 0 / .125) 0 3px  8px 0,
                              lch(0 0 0 / .125) 0 2px  5px 0,
                              lch(0 0 0 / .125) 0 1px  1px 0

depth 2 — any submenu         lch(0 0 0 / .1)   0 4px 40px 0,
                              lch(0 0 0 / .125) 0 3px 20px 0,
                              lch(0 0 0 / .125) 0 3px 12px 0,
                              lch(0 0 0 / .125) 0 2px  8px 0,
                              lch(0 0 0 / .125) 0 1px  1px 0
```

Fill, radius and border are **identical** across both depths — only the shadow
stack changes. Depth is expressed purely as blur spread, never as a lighter fill.

## Row

```
height        32px            (every row, no exceptions)
padding       0 18px 0 14px   ← asymmetric: 14 left, 18 right
radius        0 on the <li>
background    transparent on the <li>
font          13px / 19.5px 400 "Inter Variable"
label colour  lch(91.178 1.425 272)   rest
              lch(100 0 272)          data-focused
icon          16 × 16 svg at x = row.x + 14, stroke-width 1px
icon colour   tracks the label exactly (91.178 → 100)
```

Icon left edge sits at exactly the row's 14px padding, so the **icon column and
the label share one 14px gutter** — there is no separate icon well.

### The highlight is an inset child, not a row background

```
<li role="option" data-focused="true">
  <div style="position:absolute; inset:0 6px; border-radius:8px;
              background:lch(20.82 1.3 272)"/>
  …
```

219 × 32 inside a 231-wide row: **6px inset on each side, 0 top/bottom**, radius
8px. The `<li>` background stays transparent. That 6px inset is why the
highlight looks like a floating pill rather than a full-bleed band, and it is the
detail a naive `background-color` on the row gets wrong.

Per the standing rule, this fill paints on the same frame as the pointer move —
no colour transition.

### Shortcut chips are text, not chips

Despite reading as keycaps, they have **no background, no border, no radius and
no padding**:

```
wrapper   <span>, display flex, gap 3px, 21.7 × 12.1
glyph     13px / 450 weight, colour lch(64.714 1.425 272)
```

A shortcut is one `<span>` per glyph (`⇧` then `P`, `⌘` then `⇧` then `,`), each
laid out on its own with a 3px gap — that is how `⌘⇧,` stacks three glyphs in a
trailing rail without the row growing. Right edge lands on the row's 18px
padding.

The muted `lch(64.714 …)` against the `lch(91.178 …)` label is the whole
treatment. Do not add a keycap box.

### Submenu affordance

Rows that open a submenu (`Move to`, `Copy`, `Remind me`) carry a small `▶`
glyph in the same trailing rail, after the shortcut when both are present
(`Move to` shows `⇧ P ▶`).

## Group separator

Groups are separated by a 12px block, **not** by a margin:

```
<div style="position:absolute; height:12px; width:100%">
  <div role="separator" style="padding:6px 0">
    <div style="height:.5px; border-bottom:.5px solid lch(20.28 1.93 272)"/>
  </div>
</div>
```

- total block **12px** = 6px above + 0.5px rule + 6px below
- the rule is **full-bleed**: x = container.x, width = 231, no horizontal inset
- colour `lch(20.28 1.93 272)` — darker than the container border
  (`lch(25.68 1.93 272)`), so the internal rule recedes behind the outer edge

Four groups in this menu: `Move to / Pin to overview / Duplicate / Rename…` ·
`Favorite / Copy / Remind me` · `Show document history / Delete` ·
`Open in desktop app`.

## Delete is NOT red

`Delete` measures **identically** to every other row — label and icon
`lch(91.178 1.425 272)` at rest, `lch(100 0 272)` focused. There is no red text,
no red icon, no red hover fill.

Recorded explicitly because "the destructive row is red" is the assumption an
implementer brings, and painting it red here would be an invented colour.
Linear puts the whole weight of destructive-action safety on the **confirm step**
and on undo, not on menu-row colour — which is the same position our own
forgiveness stack takes.

## The three submenu shapes

All three share the container chrome above and the depth-2 shadow. They differ
in row anatomy, and each maps to a different PB need.

### A — searchable entity picker (`Move to`) · `18LR-0`

```
rect 383 × 267.5
```

- borderless **filter input** pinned at the top, placeholder `Filter...`
- current value rendered as the first row, **outside** any group, with a
  trailing `✓` and the focused fill already applied
- remaining options under muted group captions: `Teams`, `Initiatives`,
  `Projects`
- each row: entity icon → label → **identifier chip** (`EMP`, `TES`) in the
  muted colour, immediately after the label rather than right-aligned
- long labels middle/end-truncate inside the row

PB use: move-to-project, change-version, assign-owner, template picker.

### B — plain rows + multi-glyph shortcuts (`Copy`) · `18NY-0`

```
rect 271 × 141
```

No input, no groups. Four rows, each ending in a 2–3 glyph shortcut
(`⌘⇧,`, `⌘⇧'`, `⌘C`, `⌘⇧C`). This is the shape for a small fixed action set.

### C — presets showing what they resolve to (`Remind me`) · `18QD-0`

```
rect 313 × 209.5
```

- a **natural-language input** at the top: placeholder
  `Try: 4 pm, 2 days, in 5 weeks…` — so the presets are a shortcut, not the
  only path
- rows are two-column: choice on the left (`Tomorrow`), **muted resolved value**
  on the right (`Sun, 23 Aug, 9:00 AM`)
- closes with a `Custom…` escape row

PB use: anywhere a preset hides a computed result — retention windows, poll
intervals, scheduled deploys, "archive after". Showing the resolved value is the
Agency principle in one line of copy: the user never has to guess what the
preset means before committing.

## Not measured

- **Light theme — nothing here.** Every value above is dark. The light menu has
  not been opened, so the fill, the border, the separator rule, the focused fill
  and the muted shortcut colour are all unknown in light.
- **The right-click variant.** Right-clicking the row (rather than clicking ⋯)
  produced a menu whose first group reads `Unpin from overview / Duplicate /
  Rename…` — same chrome, different first item and no `Move to`. Its geometry
  was never measured; only the ⋯ variant was.
- **Open/close motion.** Whether the menu animates in at all, and what the
  submenu's open delay and hover-intent grace period are. Relevant because our
  standing rule says a high-frequency menu opens instantly.
- **Disabled rows.** `aria-disabled` exists on every row and was `false`
  throughout; the disabled treatment was never seen.
- **Scroll behaviour.** The list is `overflow-y:auto` with `max-height:none`, so
  the scroll cap comes from the popper, which was not read. No menu long enough
  to scroll was opened.
- **Keyboard traversal.** Whether `data-focused` wraps at the ends, whether it
  skips separators, and what opens a submenu from the keyboard.
- **Submenu placement rules.** All three submenus **flipped left** here because
  the parent sat at the viewport's right edge. The preferred side, the offset
  from the parent, and the vertical alignment rule (submenu C opened 37px
  *above* its trigger row) were not derived — only observed once.
