# Team overview — title + description (reference capture)

Captured 2026-08-26 from `https://linear.app/test-48bd-dd25/team/TES/overview`
via raw CDP (`scratchpad/ref-header2.mjs`, `scratchpad/ref-desc.mjs`).
**Light theme.** Dark not captured — see *Not measured*.

## The shape

Both the title and the description are **ProseMirror contentEditable
regions**, not inputs and not static text. The title is editable in place.

### Team name (the big title)

| | |
|---|---|
| element | `div.ProseMirror.editor[contenteditable=true]` |
| a11y | `role="textbox"`, `aria-label="Team name"`, `aria-multiline="false"`, `spellcheck="true"`, `translate="no"` |
| box | x 386, y 122, w 180, h 32 |
| font | **24px / 500 / 38.4px** |
| padding / margin | 0 / 0 |

### Team description

| | |
|---|---|
| element | `div.ProseMirror.editor[contenteditable=true]` |
| a11y | `role="textbox"`, `aria-label="Team description"`, **`aria-multiline="false"`**, `spellcheck="true"` |
| box | x 338, y 176, w 688, h 23 |
| font | **15px / 450 / 23px** |
| padding / margin | 0 / 0 |
| cursor | `text` |
| text colour | `lch(19.588 1.25 282)` |

**Placeholder** is not text content — it is a `::before` on an inner node,
which is why a probe searching for the string "Add a description" in
`textContent` finds nothing:

```html
<p class="text-node editor-placeholder"
   data-empty-text="Add a description…"
   aria-hidden="true"></p>
```

| | |
|---|---|
| `::before` content | `"Add a description…"` (note: ellipsis character, not three dots) |
| placeholder colour | `lch(64.64 1.25 282)` |

## Vertical rhythm

| from → to | px |
|---|---|
| title bottom (154) → description top (176) | **22** |
| description bottom (199) → "Team resources" top (227) | **28** |

## Horizontal

- description x = **338** — the content column's left edge
- title x = **386** — 48px further right, because the title sits after its
  24×24 team icon plus gap
- description width **688** = the full content column

So the description aligns to the COLUMN, not to the title text. Building it
flush with the title is the obvious wrong move.

## Nearby, for context

"Team resources" section heading: x 338, y 236, **18px / 500**.

## Not measured

- **Dark theme.** Everything above is light. The `lch()` values must NOT be
  copied either way — map to our semantic tokens (and note
  `feedback_lightningcss_drops_lch_custom_props`).
- **The editing states.** Focus treatment, hover, in-flight save, failed
  write, and whether commit is on blur / Enter / debounce were not driven.
- **Overflow.** `aria-multiline="false"` says single line, but what a very
  long description does (truncate? scroll? wrap anyway?) was not produced.
- **Permissions.** Whether a non-admin sees a read-only description or no
  affordance at all.
- **Rich text?** It is ProseMirror, so marks may be possible despite
  `aria-multiline=false`. Not tested — no bold/italic/link was attempted.
- The team NAME being inline-editable is captured above but is a separate
  feature from the description; we do not have it either.
