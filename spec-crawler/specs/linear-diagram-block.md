# Linear — diagram (mermaid) block

Captured 2026-08-27 over CDP against
`linear.app/test-48bd-dd25/document/example-document-b550ded309ec`,
**light theme**, the block in its **SOURCE** state.
Entry path: scroll the diagram block into view, hover it.

## Source state — measured

| Part | Value |
|---|---|
| container `div.diagram-container.block-node` | 805 × 194 |
| radius | **6px** |
| background | `lch(94.44 0.5 282)` |
| border | **0.5px solid `lch(89.84 0 282)`** |
| `pre` | 804 × 193, `display: grid`, radius 6px, background transparent |
| `code` padding | **16px** |
| source type | **13.125px / weight 450 / `Berkeley Mono`** — MONOSPACE |

The source text is syntax-tokenised (`span.attr`), not plain.

## Gutter control — measured

`[aria-label="Diagram actions"]`, and it is in the GUTTER (x 402 against
the block's x 420), i.e. it is the block handle, not an in-block button.

| Part | Value |
|---|---|
| box | 20 × 20, `display: inline-flex`, `align-items: center` |
| padding | `0 2px` |
| radius | **4px** |
| background | transparent |
| border | `0.5px solid transparent` |
| glyph | 16 × 16 svg |

## RENDERED state — NOT MEASURED, inventory only

Ahmed's screenshot (2026-08-27) is the only source so far. It shows, in
ONE rounded-full pill at the block's top-right, left to right:

1. comment-with-plus (add comment)
2. copy (two overlapping squares)
3. `</>` (view source — the mode toggle)
4. │ divider
5. expand arrows (fullscreen)

There is **no separate `⋯` pill** — ours has one, and ours is missing
the comment button. Ours also uses a diagram-shaped glyph for the mode
toggle where the reference uses `</>`.

Selected/double-clicked state: a **1px indigo border** around the whole
block, radius matching the container.

Node boxes in the rendered SVG: rounded corners, visible 1px border,
labels centred INSIDE the box, monospace — ours renders square, borderless
boxes with the labels escaped outside and overlapping (task #129).

## Not measured

- the rendered state's full geometry (pill size, button size, gap,
  divider, offsets from the block edge) — the block would not toggle to
  rendered over CDP; `[aria-label="Diagram actions"]` opened no
  `role=menuitem` rows, so the toggle is reached some other way.
- **dark theme, entirely.** Every value above is light.
- the four control icons' path data (must be EXTRACTED, never redrawn).
- hover / focus / active states for any control.
- the fullscreen overlay (#119).
- the rendered SVG's own theme variables (#121).

---

# Linear — document gutter (author label + block handle)

Captured 2026-08-27, same document, **light**, via the spec-crawler MCP
(`browser_attach` + `page_describe`) then driven with real pointer moves.
Commands: `node scratchpad/gutter-ref2.mjs`, `node scratchpad/extract-handle-svg.mjs`.

## Layout — measured, text column starts at x 420

| Part | x | Note |
|---|---|---|
| author label "test dma" | **329 → 385** | 12px, right-aligned; **35px inset** from the text edge |
| gap | **7px** | 385 → 392 |
| block handle | **392 → 412** | i.e. **text − 28 .. text − 8** |

The handle is **always present at opacity 1** in this document — it does
not fade in on hover. Only its plate changes.

## Handle — measured in all three states

| | plate background | icon fill |
|---|---|---|
| at rest (pointer away) | `rgba(0,0,0,0)` | `lch(39.176 1.25 282)` |
| hovering the block text | `rgba(0,0,0,0)` | `lch(39.176 1.25 282)` |
| hovering the handle | **`lch(92.44 0.5 282)`** = `#E9E9EA` | **`lch(9.794 0 282)`** = `#1B1B1B` |

Plate: 20×20, `border-radius: 4px`, `padding: 0 2px`.

**The glyph never changes.** viewBox `0 0 16 16`, 16×16,
`transform: matrix(0, 1, -1, 0, 0, 0)` and this exact `d` in ALL THREE
states — byte-identical, verified by string compare:

```
M3 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z
```

Ours already carries that same path, viewBox and rotation — the SVG was
never the drift.

## Not measured

- **dark theme** for any of the above (the capture is light).
- whether the handle fades in when block attribution is OFF.
- the handle's active/pressed state.

---

# Linear — author attribution ("Show author names")

Captured 2026-08-27 via the spec-crawler, same document.
Commands: `node scratchpad/author-map.mjs linear.app` (label→block map over
every top-level node) and `node scratchpad/author-driver.mjs` (does it follow
the pointer?).

## The model — measured

**ONE label per RUN of consecutive blocks by the same author, sticky.**
Not one per block, and not pointer-driven.

- A 37-block single-author document showed **exactly one** label.
- Hovering six different blocks in turn (diagram, blockquote, h1, h2,
  paragraph, bullet) did NOT move it — it stayed pinned at y 69, just
  under the breadcrumb. It follows the SCROLL, not the pointer.
- `position: static` on the label itself; the pinning comes from the run
  band around it.
- 12px type, right-aligned, ending 35px before the text column.

**A non-text block is inside the run.** The one label observed was
attached to a 717px-tall DIAGRAM block — so diagrams participate in
attribution exactly like paragraphs, rather than being skipped.

## Not measured

- a RUN BOUNDARY — two authors in one document. The test workspace has a
  single account, so where one run ends and the next begins, and whether
  the boundary is marked, are unverified.
- code block, image, table, divider and collapsible: not present in the
  reference document at capture time.
- what a since-removed author renders as.
- the pin offset from the scrollport top (ours is 12px, and is OURS).
