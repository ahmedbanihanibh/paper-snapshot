# Create-issue composer — collapse ⇄ maximize

The composer was fully captured and re-implemented in a standalone prototype
BEFORE this spec round. **The prototype is the spec** — do not re-measure what
it already encodes:

    ~/Documents/paper-snapshot/react-prototype/
      src/Composer.jsx    — the anatomy + every captured value, annotated
      src/icons.jsx       — icons lifted verbatim from the captured frame
      src/index.css       — tokens read from the live composer
      filmstrip/f-*.png   — 7 frames of the maximize animation (0→100%)
      max-700.png / max-900.png — maximized at two window heights (the vh proof)

## The animation contract (from Composer.jsx, verified against live earlier)

**300 ms · `cubic-bezier(0.43, 0.07, 0.59, 0.94)` · three elements, three
properties:**

| element | property | collapsed → maximized |
|---|---|---|
| wrapper (`role=dialog`) | `padding` | `13vh 12px` → `6vh 12px` |
| panel | `max-width` | `750px` → `820px` |
| inner form | `min-height` | `0` → `88vh` |

- The vertical padding is **vh, not px** — proven by two-height captures
  (94/43px @ 723 vs 117/54px @ 900). Percentage padding resolves against
  width, so vh is the only unit fitting both.
- The **property split is load-bearing**: height animates on the inner form,
  width on the panel. Collapsing both onto the panel hits the same endpoints
  but mis-renders between ~30–70% of the tween.
- Wrapper is `items-start` — the collapsed panel is content-sized (261px);
  a stretched panel fills the padded area while every inner band still
  measures "correct".

## Panel + control anatomy (from the same capture)

- Panel: radius **22px**, 0.5px border, five-layer shadow, `max-height: 100%`,
  overflow **visible** (shadow unclipped).
- Metadata pills: 24px tall, fully round, `pl-1.5 pr-2`, 5px icon-label gap,
  12px/12px 500, **0.5px transparent border at rest** so hover/selected
  colouring never shifts a pixel.
- Icon-only pills 24×24; header controls 28×28, transparent at rest, hover
  `bg-chip`. **Every control in the composer is a pill** — radius 9999
  throughout, zero rounded-rects.

## Attribute-pill popovers — MEASURED (walked in the live composer)

NOT the 708px palette: each pill opens the **same 207px anchored picker** as
the inline row icons (`issues-interactivity.md` §4c), anchored 4px under the
pill's left edge:

| pill (x, row y267, h24) | picker | content |
|---|---|---|
| Status "Backlog" (354) | 207×241 | **6 states — NO Duplicate at create time** (Backlog¹…Canceled⁶) |
| Priority (438) | 207×209 | 5 rows, digits 0–4 |
| Assignee (519) | 207×207 | members + "Other agents: Cursor" |
| Project (610) | **383**×207 | projects + Create new |
| Labels (689) | 207×177 | labels multi-select |
| More actions ⋯ (804) | 192×153 | `Set due date ⇧D ▶` · Make recurring… · `Add link… ^L` · `Add sub-issue ⌘⇧O` |

Collapsed composer measured live: **750×261 at (341,94)**; header row y107
(TES scope pill 55×24 · Expand 28×28 · Close 28×28); pill row y267; footer
y315 (attach 28×28 left · **Create issue 93×28** right).

The one-contract now spans FIVE entry surfaces (palette recipe, context
submenu, bulk palette, inline icon picker, composer pill picker) — the
anchored-picker variants all share the 207px width token.

## Animation parity — VERIFIED (scripted, 2026-08-11)

`verify-animation-parity.mjs` ran prototype (localhost:5178) vs live Linear:
**PASS, worst delta 0px** at all 7 progress fractions (0/.15/.3/.5/.7/.85/1).
Duration 300ms, easing `cubic-bezier(0.43,0.07,0.59,0.94)`, animated props
`div:max-width | div:padding-top/bottom | form:min-height` — identical on both
sides. Endpoint truth at 900-height window: 750×261.2 @117 → 820×792 @54.
The prototype is a frame-perfect motion spec; port `Composer.jsx` verbatim.

## Still to capture (open remainder)

- Light-mode composer (tokens map via color-tokens-light.md hue rule; not
  re-captured).
- The "Create more" toggle behaviour and the draft-persistence path (close with
  content → Drafts).
