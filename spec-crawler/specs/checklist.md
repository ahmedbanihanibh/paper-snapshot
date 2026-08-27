
### 2026-08-27 — collapsible sections do NOT nest, and swallow lower headings

Making the `h1` collapsible took the document from **37 blocks to 22** —
16 absorbed, straight through the `h2` nine blocks below it, to the end.

- `nestedSections: 0`. The inner `h2` stays a plain `H2.heading-node`
  child of the section body. `collapsible-section` does not recurse on
  its own; nesting exists only if the user makes the inner heading
  collapsible too.
- A lower-level heading does NOT end the range.

Status: **measured** — `scratchpad/collapse-nesting.mjs`. **Still not
measured**: whether an equal-or-higher-level heading ends the range. The
reference document has no two same-level headings in sequence, so the two
samples cannot distinguish "to the next heading of equal-or-higher level"
from "to the end of the document" — produce that shape before
implementing the rule.

Reference document restored to 37 blocks, verified. (The odd
`'rsioHeading two'` text at index 22 is pre-existing, present in the
before-capture too.)

### 2026-08-28 — the collapsible range ends at the next EQUAL-or-higher heading

The reference document has no two same-level headings in sequence, so the
shape was built: `## ZebraAAA` / body / `## ZebraBBB` / body. Making
`ZebraAAA` collapsible absorbed **only** its own heading and body —
`containsBBB: false`, `headingsInside: [H2 'ZebraAAA']`, 46 → 45 blocks.

**A section runs from its heading to the next heading of EQUAL-OR-HIGHER
level, else the end of the document.** Both samples now agree: the `h1`
swallowed a lower-level `h2` and continued to the end, which is what this
rule predicts.

Status: **measured** — `scratchpad/range2.mjs`.

Method note worth keeping: `Input.insertText` does NOT fire ProseMirror
input rules, so `"## "` stays literal text. Per-character
`Input.dispatchKeyEvent` with `text` does fire them. That one difference
is why the first attempt produced five junk paragraphs instead of two
headings.
