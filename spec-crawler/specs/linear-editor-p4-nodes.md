# Linear editor — P4 node types (H4, collapsible, date chip, table, diagram)

Captured 2026-08-24 over CDP 9222 on the disposable doc
(test-workspace-bb), light + targeted dark re-measures. Trees in
`spec-bundle/extracted/`: linear-h4-tree.txt,
linear-collapsible{,-collapsed}-tree.txt, linear-datechip-tree.txt,
linear-table-tree.txt, linear-diagram-tree.txt,
linear-toolbar-collapse-askagent-glyphs.json, linear-collapsible-chevron.json.

## Heading 4
- Reached via slash row "Heading 4" (⌘⌥4) — markdown `#### ` does NOT
  convert (verified: stays a plain paragraph).
- h4: 15px/600, 24px line, margin 0 0 6px (mt unmeasured — first block).

## Collapsible section (⌘⇧6, slash row 12, toolbar Collapse)
- wrapper div[aria-label="Collapsible section"], pl-24, relative.
- toggle 21×20 in the gutter on the title row; chevron = play-triangle
  path (in chevron json), `transition: transform 0.15s`; identity
  transform = COLLAPSED (points right), rotate-90 = open.
- collapsed keeps only the title row (64 → 24 measured).
- title row: pl-24 -ml-24 r:6 with a background-color transition on the
  reference (we deliberately paint same-frame per house rule).
- Toolbar "Collapse" glyph = double chevron (extracted, in glyphs json),
  position 8 of the full-variant selection toolbar.

## Selection toolbar, full variant (re-measured)
493×35, 14 controls in order: Regular text(42w) · Bold · Italic ·
Strikethrough · Underline · Link · Quote · Collapse · Inline code ·
Code block · List(42w) · Create issue from selection · Ask agent ·
Comment. All 26w except the two 42w dropdowns.

## Date chip (search-only slash row "Date")
- Inserts inline pill "Today": 22h, padding 1.5/4.5/1.5/3, r:4.
- Ground lch(53 52.26 286.91 / 0.4) — verified as the RESTING style by
  re-measuring after moving the caret away (not a selection wash).
  Dark (measured): lch(47.918 59.303 288.421 / 0.4).
- Border 0.5px lch(89.84 0 282) light / lch(18.48 1.48 272) dark.
- Label 15px/450 foreground, cursor pointer.

## Table (search-only slash row "Table"; inserts 2 cols × 3 rows w/ header)
- table: bg lch(97.94 .5 282), r:6, 0.5px lch(89.84 0 282), mb 1px.
  Dark (measured): bg lch(5.52 .4 272), border lch(18.48 1.48 272).
- th row 34h, bg lch(92.44 .5 282) (dark lch(7.32 .85 272)), cell
  padding 5px 8px; colgroup 50/50.
- hover overlays: add-row bar full-width×18h below (bg lch(94.44 .5 282)
  light / lch(9.345 .85 272) dark, r:4, centered 12px + glyph);
  add-col bar 18w × table-height right; "Table actions" 20×20 handle in
  the 28px gutter (same anatomy as heading/diagram handles).

## Diagram (slash row 11 "Diagram")
- block bg lch(94.44 .5 282), r:6, 0.5px lch(89.84 0 282), mt 6.
- source state: pre>code, 16px padding, overflow auto.
- hover pill = the link-embed pill (ground srgb .976/.8, 0.5px
  rgba(0,0,0,.4), 26×26 buttons, 1×18 lch(73.64 0 282) divider):
  Copy source · Show diagram · │ · Fullscreen + separate 27×27 ⋯
  ("Open menu"). Empty source relabels buttons "No source code to
  copy" / "No diagram to show" (same controls, inert).

## Not measured
- Reference rendered-diagram geometry — the Show diagram toggle never
  fired over CDP (clicked twice, block unchanged); ⋯ menu contents.
- Date chip click behavior on the reference (no popup observable);
  ours opens a Calendar popover.
- Collapsible COLLAPSED tree is byte-identical to expanded in the dump
  (the toggle click in that probe likely re-expanded) — collapse height
  64→24 was measured in a separate run; the collapsed DOM shape is
  inferred (children hidden), not dumped.
- h4 mid-document top margin; table resize-handle chrome; dark-mode
  diagram block; multi-user mention popup ordering.
- Whether the Aa block-type dropdown gained a Heading 4 row alongside
  the slash row — two differently-shaped detectors failed to re-open
  the Aa menu on a fresh tab (2026-08-24); ours ships Regular/H1/H2/H3
  until captured.
