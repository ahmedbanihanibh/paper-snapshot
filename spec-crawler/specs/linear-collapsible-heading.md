# Linear — collapsible headings

Captured 2026-08-27, Chromium, light, viewport 1432×723, on the test
workspace's `Example document`. Scripts (scratchpad): `collapse2.mjs`,
`collapse3.mjs`, `collapse-anatomy.mjs`, `collapse-toggle.mjs`,
`collapse-restore.mjs`.

**The reference document was restored** — `Remove collapsible` put it back
to its original 37 top-level blocks, verified after the capture.

---

## It is a WRAPPER NODE, not an attribute on the heading

This is the finding that decides the whole implementation. Choosing
"Make collapsible" on an `h2` did not add a flag to the heading — the
document went from **37 top-level blocks to 31**. The heading and the six
blocks that followed it were absorbed into ONE new block.

DOM, innermost to outermost:

```
DIV.collapsible-section          aria-label="Collapsible section"
 └ DIV                                                    ← content column
    ├ DIV.collapsible-heading    aria-expanded="true|false"
    │   ├ DIV.collapse-toggle
    │   │   └ BUTTON
    │   │       └ svg            the caret
    │   └ DIV
    │       └ H2.heading-node
    └ P, P, DIV.diagram-container, …                      ← the section body
```

Measured boxes (expanded, an h2 section containing 6 blocks):

| Part | Box (w × h) | Offset from section |
|---|---|---|
| `collapsible-section` | 805 × 410 | — |
| inner content column | 781 × 410 | **x + 24** |
| `collapsible-heading` | 805 × 28 | x 0 |
| `collapse-toggle` | 21 × 28 | **x − 5** (in the gutter) |
| its `button` | 21 × 20 | x − 5, y + 4 |
| its `svg` | 16 × 16 | x − 2, y + 6 |
| `H2.heading-node` | 781 × 28 | x + 24 |

So the section indents its content by **24px** and hangs the toggle 5px
into the gutter, left of the text column.

## The two states

| | expanded | collapsed |
|---|---|---|
| `aria-expanded` on `.collapsible-heading` | `"true"` | `"false"` |
| section height | **410** (heading + 6 blocks) | **28** (the heading row alone) |
| caret `transform` | `matrix(0, 1, -1, 0, 0, 0)` — 90° | `matrix(1, 0, 0, 1, 0, 0)` — identity |
| body in the DOM? | yes | **yes, still there** — hidden, not removed |

So identity = collapsed (caret points right), rotated 90° = expanded
(caret points down), and collapsing does not detach the content.

## The caret animates — 150ms

```
transition:     transform 0.15s
transform-box:  view-box
```

Note `view-box`, not `fill-box`. Our own house rule
(`feedback_rotating_icon_needs_fill_box`) prescribes `fill-box` because a
rotation about the wrong box pivots off-centre; the reference achieves a
centred pivot a different way. Whichever we use, the pivot must be
verified visually, not assumed from the property name.

This is one of the few places the reference DOES animate, and it survives
the house animation rules: it is a shape transition, not a colour one,
and 150ms on a toggle the user drives deliberately is not on the
interaction's critical path.

## The menu row is STATE-DEPENDENT

`Heading actions` on a plain heading offers **`Make collapsible`**. On a
heading already inside a section, the same menu offers
**`Remove collapsible`** — captured, and clicking it dissolved the
section back into 37 top-level blocks.

Same class as the Favorite/Unfavorite and Pin/Unpin bugs (#16, #18): a
row whose label is a fixed string is wrong half the time.

## Not measured

- ~~Nesting~~ and ~~where the range ends~~ — **both settled** by making
  the document's `h1` collapsible (`scratchpad/collapse-nesting.mjs`).
  See below.
- **Dragging a collapsed section**: does it carry its hidden children?
- **The author gutter** over a collapsed range.
- **History/restore preview** of a collapsed section (relevant to #142).
- The caret's own hover/focus chrome, and the collapsed heading's.
- Dark theme for all of the above.


---

## Nesting and range, settled

Making the `h1` collapsible took the document from **37 blocks to 22** —
it absorbed **16** blocks, straight through the `h2` that sits 9 blocks
below it, to the end of the document. Section height 794.

Inside that section:

```
nestedSections:   0
headingsInside:   H1 'Heading one',  H2 'Heading two'
directBlocks:     DIV.collapsible-heading, P, P, UL, OL, BLOCKQUOTE,
                  UL, P, P, H2.heading-node, P, P, …
```

Two rules fall out:

1. **A lower-level heading inside the range stays a PLAIN heading.** The
   `h2` is a direct `H2.heading-node` child of the section body — not
   wrapped, not nested. `collapsible-section` therefore does NOT recurse
   on its own; nesting only exists if the user makes the inner heading
   collapsible too.
2. **A lower-level heading does not end the range.** The `h1`'s section
   swallowed the `h2` and everything after it.

**SETTLED** (`scratchpad/range2.mjs`). The reference document has no two
same-level headings in sequence, so the shape was BUILT: `## ZebraAAA` /
`aaa body` / `## ZebraBBB` / `bbb body`, typed with real key events so the
`## ` input rule fires (`Input.insertText` does not fire input rules — it
leaves the literal text).

Making `ZebraAAA` collapsible produced a section containing **only**
`ZebraAAA` and `aaa body`. It stopped at the next `h2`:

```
containsBBB:      false
containsAaaBody:  true
containsBbbBody:  false
headingsInside:   [ H2 'ZebraAAA' ]
count:            46 -> 45     (two nodes absorbed into one)
```

**THE RULE: a section runs from its heading until the next heading of
EQUAL-OR-HIGHER level, or the end of the document.** That reconciles both
samples — the `h1` earlier swallowed a LOWER-level `h2` and carried on to
the end, exactly as this rule predicts.

The reference document was restored to 37 blocks with zero sections and
verified block-by-block. (Note: the `'rsioHeading two'` text at index 22
is PRE-EXISTING damage, present in the before-capture too — not caused by
this session.)

---

# The two entry points, and the collapsed-height rule — both settled

Captured 2026-08-28, `scratchpad/cmd-shift-6.mjs`, one session.

## ⌘⇧6 wraps the CURRENT BLOCK only — verified, not inherited

An earlier session's capture (2026-08-24) recorded ⌘⇧6 as an entry point
but this session had not pressed it. Now measured directly:

```
before          45 blocks, 1 section
⌘⇧6 on a paragraph
after           45 blocks, 2 sections
                the new one contains ONLY that paragraph
⌘⇧6 again       46 blocks, 1 section     ← it toggles back out
```

So Linear has **two entry points into the same node, taking different
ranges**, and both are now first-hand:

| Entry | Range |
|---|---|
| ⌘⇧6 (also the slash row and the selection toolbar) | the CURRENT block |
| the heading handle menu's **Make collapsible** | the heading and everything to the next heading of equal-or-higher level |

## The collapsed height is the TITLE BLOCK's height

The 2026-08-24 capture recorded `64 → 24`; this session's recorded
`410 → 28`. They were left unreconciled. They are not in conflict — they
measured sections with different TITLES, and the same session reproduced
both numbers:

| Section | Title block | Expanded | Collapsed |
|---|---|---|---|
| ⌘⇧6 on a paragraph | paragraph | **64** | **24** |
| Make collapsible on an `h2` (6 body blocks) | `h2` | **410** | **28** |

A paragraph row measures 24 and an `h2` row measures 28 — the same values
seen throughout this spec. **Collapsed, a section is exactly its title
row**, which is what "the body is hidden, not removed" looks like in
pixels. The expanded height is just whatever its content sums to, so it
carries no rule at all and neither 64 nor 410 should ever be quoted as a
constant.

## The 40px is a SEEDED EMPTY PARAGRAPH, not padding

`scratchpad/forty-px.mjs`. A ⌘⇧6 section is not a one-block section at
all — the subtree shows a second child:

```
DIV.collapsible-section        h 64   margin-top 16
 └ DIV                         h 64
    ├ DIV.collapsible-heading  h 24   y 0    minHeight 24px
    │   ├ DIV.collapse-toggle  h 24
    │   └ DIV → P.text-node    h 24          ← the title
    └ P.text-node              h 24   y 40   margin-top 16
        └ BR.ProseMirror-trailingBreak       ← EMPTY
```

`24 + 16 + 24 = 64`, exactly. **⌘⇧6 seeds an empty body paragraph**, so a
freshly created section has somewhere to type instead of being a bare
title. Collapsing it hides that paragraph and the section falls to 24 —
the title row alone, which is the same rule a third time.

So nothing here is padding, and every number in this spec is now
accounted for.

## Not measured

- Whether the heading-menu path (`Make collapsible`) also seeds an empty
  paragraph when the heading has NO body. The one sample of that shape
  came from our own test schema, not the reference.

## Our build — drive gate, 2026-08-28 (Chromium/Edge, port 9222)

Both handle menus driven end to end against `localhost:3000`, document
`/welcome-seed-test-2026/document/ahmed-doc1-…`.

### Heading menu (plain top-level heading)

```
handle  {"label":"Heading actions","offsetFromBlockTop":4}
rows    ["Copy link","Make collapsible"]
click "Make collapsible" → sections 0→1, menu closed, no exceptions
```

### Heading menu (heading that IS a section) — the state-dependent row

```
handle  {"label":"Heading actions","offsetFromHeadingTop":4}
rows    ["Copy link","Remove collapsible"]
click "Remove collapsible" → sections 1→0,
      headingSurvives true, bodySurvives true   (exact round-trip)
```

### Diagram menu

```
handle  {"label":"Diagram actions","offsetFromBlockTop":8}
rows    ["Copy link","Copy diagram","Copy source","Select","Delete"]
surface {"radius":"12px","pad":"6px 0px","bg":"rgb(33,33,34)",
         "border":"0.5px solid rgb(60,61,64)"}
escape  {"menuOpen":false,"urlChanged":false}
drag    dragPlate true, menuAfterDrag false
```

`bg rgb(33,33,34)` is `#212122` — the same surface value measured on the
reference's own block-handle menu, so the house menu primitives already
land on it without a per-menu override.

## Two traps this gate walked into — both cost multiple runs

**1. A tiptap extension change is invisible to HMR.** Extensions are
captured when the `Editor` is constructed, so an edited command keeps
running its OLD body until the page RELOADS. Three consecutive runs
reported "Make collapsible does nothing" against code that was already
fixed. Any drive gate that touches an extension must reload first.

**2. The handle unmounts the moment the pointer leaves the gutter strip.**
The sweep ran to `x = 370`, one step OUTSIDE the strip (`x >= rootLeft -
GUTTER - 4` ≈ 376), and only then queried — so it measured the handle's
absence, three times, on a handle that was present at x=394 the whole
sweep. It read as a regression in the resolver and was purely the probe.
The gate now stops at x=392 and queries while still hovering.

Generalised: for any hover-revealed affordance, the query must run at a
pointer position that still satisfies the reveal condition. "It was not
there when I looked" is a claim about where you were standing.

## The section itself — anatomy, both states (2026-08-28, dark, Edge/9222)

Measured on the reference's own `.collapsible-section` (it already had
one; `scratchpad/ref-collapsible{2,3}.mjs`).

```
div.collapsible-section.block-node   role=region  aria-label="Collapsible section"
                                     data-open="true"   ← REMOVED when collapsed
  padding: 0 0 0 24px   margin: 22px 0 0   position: relative
  div.collapsible-heading            aria-expanded  aria-controls=<section id>
    padding-left: 24px  margin-left: -24px     ← gutter pull
    div.collapse-toggle              position: absolute, 21×28, flex/center
      button                         21×20, padding 0 2px, cursor: DEFAULT
        svg 16×16  filled play-triangle
  <body blocks>                      display:none when collapsed
```

| Value | Open | Collapsed |
|---|---|---|
| section height (h2 + 1 paragraph) | 68px | 28px |
| title `margin-bottom` | 16px | **0** |
| svg transform | `rotate(90deg)` | identity (points right) |
| button color | `lch(90.451 1.2 272)` | same |
| button on HOVER | bg `lch(14.006 0.593 272)`, color `lch(100 0 272)` | — |
| toggle opacity at rest | **1** — always visible, NOT hover-revealed | 1 |

**Click target: the toggle button ONLY.** Clicking the heading TEXT does
not collapse — verified by clicking it and re-reading (`data-open` stayed
`true`, height stayed 68). It only places the caret.

**Deliberate divergences from the reference**, both recorded rather than
silently taken:

1. The reference transitions the hover plate over `background-color
   0.15s`. Ours paints it on the interaction's own frame — a colour
   transition is banned app-wide (`pb-design/no-transition-colors`).
2. The reference's toggle is `cursor: default` (it inherits from a
   text-cursor region). Ours is `cursor: pointer`, because our own
   shipped rule is that a pointer means an action and this is a real
   button. **Worth a decision from Ahmed** — the reference and our house
   rule genuinely disagree here.

## Not measured

- Nesting a section inside a section (our command refuses; the
  reference's behaviour is unverified).
- Enter at the end of the title, and Backspace at the start of it.
- Copy/paste of a COLLAPSED section — whether the hidden blocks travel.
- Dragging a collapsed section.
- Whether the reference persists collapsed state per-user or in the doc
  (ours is in the doc, so it is shared and survives reload — verified).
