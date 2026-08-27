
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
