# Linear — document outline rail (minimap)

Surface: `linear.app/test-48bd-dd25/document/example-document-b550ded309ec`
Captured 2026-08-28, Chromium via CDP :9222, viewport 1432x723, **LIGHT**
theme (`prefers-color-scheme: dark` = false, `localStorage.darkMode` = "false",
both read in the same call as the colours). An earlier draft of this file said
DARK — that was wrong: the theme flipped part-way through the session and the
provenance line was written from memory rather than from a probe.
Board item #148. Fixture: 6 headings — Headddd (h4), hhrehhh (h3),
Heading one (h1), Heading two (h2), dZebraAAA (h2), ZebraBBB (h2).

## The finding that reframes the task

#148 was written as "it renders TWO ways and switches between them" — tick
mode and label mode. Measured, it is **ONE list that scales**.

Each row's inner `<span>` CONTAINS THE HEADING TEXT (`innerHTML` is
`Headddd`; one text node). Its own layout box is **56.74 x 15.5px** at
`font-size: 13px`, `font-weight: 450`, Inter Variable, `white-space: nowrap`,
`overflow: hidden` — while its PAINTED rect in the resting state is
**28 x 8px**. That is ~0.5 in both axes.

So the "dashes" are the words themselves, squashed and clipped. There is no
separate tick glyph to draw: nothing paints them — `backgroundColor` is
transparent, `border` is `0px none`, `box-shadow` is `none`, the span has
zero element children, and BOTH `::before` and `::after` compute
`content: none`. A build that draws literal dashes and swaps them for a text
list on hover would be a different component that happens to look similar at
rest.

## Measured — resting geometry

| | value |
|---|---|
| rail box | x 205, y 328, w 63, h 83 (6 headings) |
| rail position | `absolute`, `padding: 0 0 0 8px`, `transition: all` |
| rail opacity | `0` effective, every state sampled — and it paints nothing (A/B: 0 pixels differ with `display:none`) |
| rail transform | `matrix(0.5, 0, 0, 0.5, -16, -82.5)` — the 0.5 scale, read directly |
| rail pointer-events | `none` — so hovering the rail cannot be the trigger |
| row (anchor) | 46 x 12, x 215 — full width at EVERY level, so the hit target does not shrink with the mark |
| row pitch | 12px exactly (y 333, 345, 357, 369, 381, 393) → 4px gap around an 8px mark |
| mark height | 8px |
| mark alignment | RIGHT — every mark ends at x 261 |

## Measured — the mark width encodes HEADING LEVEL, not text length

| heading | level | mark w | mark x |
|---|---|---|---|
| Heading one | h1 | 46 | 215 |
| Heading two | h2 | 40 | 221 |
| dZebraAAA | h2 | 40 | 221 |
| ZebraBBB | h2 | 40 | 221 |
| hhrehhh | h3 | 34 | 227 |
| Headddd | h4 | 28 | 233 |

**h1 46 / h2 40 / h3 34 / h4 28 — a 6px step per level**, right-aligned to a
common right edge. The task asked whether width encodes level or label
length; the fixture settles it, because `Headddd` (h4) and `hhrehhh` (h3) are
both 7 characters and differ by 6px. Deeper levels are SHORTER and indent
from the left, which is why the strip reads as a hierarchy.

## Measured — the ramp is COLOUR LIGHTNESS, not opacity

Every row has `opacity: 1`. What varies is the mark's `color`, all on the
same hue and chroma:

| heading | colour |
|---|---|
| Headddd | `lch(20 1 282)` |
| Heading one | `lch(40 1 282)` |
| hhrehhh, Heading two, dZebraAAA, ZebraBBB | `lch(66 1 282)` |

Three distinct lightnesses at one scroll position — L20, L40, L66 — re-read
with the theme recorded in the SAME call (light). It does NOT track heading
level (h4 is L20 while h3 is L66). #148 read these as "different opacities"
from a screenshot; they are one colour token at three lightnesses, which
matters because our clone would otherwise implement a wrong mechanism that
looks right in one frame.

Note these are the values the element COMPUTES while it paints nothing (see
Not measured). They are the resting palette, not an observed appearance.

## Not measured — and the mechanism ruled out for each

- **The reveal trigger.** The rail computes `opacity: 0` — effective, walking
  the whole ancestor chain — in EVERY state sampled, and it paints nothing at
  all. Proven by A/B rather than by reading a number: clip the rail's box,
  set the rail to `display: none`, re-clip, and diff. **0 pixels differ.**

  RULED OUT as triggers: hovering a row (pointer walked in and parked 700ms);
  hovering the gutter 5px to its left; pointer anywhere in the content;
  a wheel event on the real scroller sampled at 120ms / 520ms / 2s; and a
  programmatic `scrollTop` change sampled at 150ms / 1.6s. The rail also
  computes `pointer-events: none`, which independently rules out any
  hover-on-the-rail mechanism.

  CORRECTION, because an earlier draft of this file asserted the opposite:
  I wrote that "the marks are plainly visible in full-page screenshots taken
  moments earlier". That was not measured — I read a flat `#eeeeef`
  rectangle in the left gutter as the tick strip. The A/B above shows that
  region is unaffected by the rail's presence. What *is* true is that
  earlier DARK-theme screenshots show short marks of varying length at that
  gutter position; those have NOT been proven to be this element, and no
  probe has yet caught the rail painting.
- **Label mode geometry** (Ahmed's image 352: ~195x275 panel, right-aligned
  rows). Not reachable without the trigger above.
- **The rule behind the L20/L40/L66 ramp.** One scroll position only. Needs
  sampling at several offsets; the document scroller is not
  `document.scrollingElement`, so the scroll probe needs the right element
  first.
- Click-to-scroll on a mark; active/current treatment while scrolling.
- DARK theme — light only here. Switching needs `Emulation.setEmulatedMedia`,
  and note it LATCHES `localStorage.darkMode`, so restore it afterwards.
- Every rough edge #148 lists: one heading, zero headings, very long text,
  30+ headings, duplicates, headings inside a collapsible, empty heading.

## Reconciliation with the earlier note

#148 asked whether the rail is the same component as the `a.outline` links
seen at x 215, 45x12. It is — same anchors, same 12px pitch. The x 8-18
coordinates in Ahmed's crop are relative to his screenshot, not the viewport.
