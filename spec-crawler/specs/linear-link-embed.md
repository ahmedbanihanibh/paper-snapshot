# Linear — link embed block (`Show embed`)

Captured 2026-08-24, `test-workspace-bb/document/ddee-1daad9c37a3f`, light,
via `scratchpad/link-inventory.mjs` + `/tmp/embed.mjs` + `/tmp/embed2.mjs`.

## The precondition — and the false negative it produced

An earlier pass clicked `Show embed` on a link **inside a sentence**, saw the
document not change, and recorded "produces no observable change; behaviour
unexplained". That was a **wrong precondition, not a no-op.**

**The link must be ALONE on its own paragraph.** With that, the click replaces
the paragraph with a block node — `pm.children` 8 → 9, `innerHTML` 2 086 →
11 945 chars.

Entry path: type a word on an empty paragraph → select it → ⌘K → paste the URL
→ Enter → re-select the word → ⌘K → `Show embed`.

## The block

```
div.nodeview-embed.block-node          805×101   contenteditable="false"
└ div (node-container, .selected-node when selected)
  └ div  805×101  flex column · radius 6 · bg lch(100 0 282)
                  · border 0.5px lch(91.9 0 282) · overflow hidden
    └ a[href][target=_blank][rel="noopener noreferrer"]  804×100
      └ div  804×100  flex row
        └ div  804×100  flex column · gap 6 · padding 12px 20px 12px 16px
          ├ span 768×16   13px / 500 · lch(10 0 282)   ← site/title ("Linear")
          ├ span 768×33   13px / 450 · lch(40 1 282)   ← description, 2 lines
          └ span 768×16   13px / 450 · lch(40 1 282)   ← the raw URL
```

Radius **6** — note this is off our {8,12,16,full} vocabulary and needs a
census before it becomes a rule exception.

## The hover toolbar (a surface of its own — NOT previously in any ledger)

Two floating pills over the card:

**Pill A** — `118×31` · `radius full` · `background color(srgb .976 .977 .980 / .8)`
· `border 0.5px rgba(0,0,0,.4)` · `padding 2`

| # | box | glyph (extracted, `viewBox 0 0 16 16`) |
|---|---|---|
| 1 | 26×26, radius full, pad 6, icon 14 | **open external** — same path as the link editor's `Open` |
| 2 | 26×26 | `M2.10972 1.93688C2 2.20775 2 2.55017 2 3.235V12.765…` (panel/reader) |
| 3 | 26×26 | `M9.30558 10.206C9.57224 10.4726 9.59447 10.8912…` (link/unlink) |
| — | 1×18 divider, `background lch(73.64 0 282)` | |
| 4 | 26×26 | **trash** — same path as `Remove link` |

**Pill B** — `27×27` · radius full · same ground/border · one 26×26 button
with the ⋯ glyph `M3 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z`

## Not measured

- Pill placement relative to the card (which corner, what offset) and whether
  they are hover-revealed or always present — they were read from a live DOM
  dump, not from a hover/no-hover comparison.
- The ⋯ menu's contents. **Never opened.**
- Glyph paths 2 and 3 in full — truncated at 200 chars by the tree dump.
- What the card looks like while the URL is being fetched (in-flight), and for
  a URL with no metadata / a failed fetch.
- A non-Linear URL: whether the title row still reads as a site name.
- Dark theme.
- Whether the embed can be converted back to an inline link, and how.
- Selected state (`.selected-node` class exists; its styling not captured).
