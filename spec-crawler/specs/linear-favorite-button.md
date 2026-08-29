# Linear favorite (star) affordance

Captured 2026-08-26 over CDP, dark, viewport 1432×723, at
`linear.app/test-workspace-bb/team/TES/overview`.

## The button

| Property | Value |
|---|---|
| box | `28 × 28` (header instance); a second 24×24 instance exists on rows |
| radius | `9999px` |
| background | transparent at rest |
| glyph fill | `lch(61.803% 1.2 272)` — the muted rank, i.e. the same rest rank as an unselected tab pill and a menu glyph |
| `aria-label` | **"Add to favorites"** |
| `title` | none — the tooltip is a custom layer, not native |

## The tooltip — and the string is NOT the aria-label

Hovering prints **"Favorite team"** plus a key cap.

That is worth stating loudly because the two strings differ and it is an
easy thing to get wrong by copying the accessible name into the visible
tooltip:

| Surface | String |
|---|---|
| `aria-label` (screen readers) | `Add to favorites` |
| visible tooltip | `Favorite team` |

The tooltip names the OBJECT ("team"), the aria-label names the ACTION.

### The chord

**`⌥F` (Option/Alt + F)** — printed inside the tooltip as a key cap:

| Property | Value |
|---|---|
| cap box | `18 × 17` |
| radius | `4px` |
| font | `11px / 400` |
| ground | transparent |

Matches the Kbd cap already recorded in
`docs/linear-design-system.md` §3 (20×21, radius 3, 11px, transparent) —
within a pixel, same family.

## Per-object wording — MEASURED, and it is not derivable

The tooltip names the object, and the noun is a real per-object string:

| Surface | URL | Tooltip |
|---|---|---|
| team overview | `/team/TES/overview` | **"Favorite team"** |
| agent chat | `/agent/create-diagram-4c996c42fb3ca` | **"Favorite agent chat"** |

Both captured over CDP, dark, 2026-08-26 (`probe-agent-fav2.mjs` — match
the tooltip on `/favorite/i`, not on "newest added node": Linear's
"Syncing" indicator mounts around the same time and wins a naive diff).

**"agent chat" is two words and is neither "agent" nor "chat".** No
derivation from the kind slug would produce it, which is the argument
for capturing each surface rather than generating the noun. Both
instances share `aria-label="Add to favorites"` and a 28×28 header
button, so the aria-label is NOT per-object — only the tooltip is.

Our mapping lives in one table: `KIND_NOUNS` in
`components/favorites/favorite-button.tsx`, split into measured vs
inferred blocks, with the add-a-kind procedure in its docblock.

## Not measured

- **The tooltip's open delay.** The probe polls over CDP and each poll
  costs a round-trip, so its ~25s total is an artefact of the harness,
  not a measurement. Do not quote it.
- Whether `⌥F` fires from anywhere on the page or only while the header
  is focused.
- The remaining kinds' wording. Team and agent chat are measured (above);
  document, issue, project, protocol and view are still UNKNOWN — our
  strings for those are the kind's own noun and are marked inferred in
  `KIND_NOUNS`. Per the one-value-capture rule, unknown is not "the same".
- The 24×24 ROW instance's tooltip (the sidebar rail's star), as distinct
  from the 28×28 header instance.
- Light theme.
- The FAVORITED state: fill colour, whether the glyph swaps to a solid
  star, and what the tooltip says once set (presumably "Unfavorite …",
  not captured).
