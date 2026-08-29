# Linear team tab pills (Overview / Documents / Members)

Captured 2026-08-26 over CDP, dark theme, viewport 1432×723, at
`linear.app/test-workspace-bb/team/TES/overview`.

Entry path that works: `Page.navigate` to the team overview (setting
`location.href` is swallowed by the SPA and leaves you on the old route —
two probe runs were lost to that), then select links by the signature
`border-radius: 9999px` AND `height: 28`.

## Distinguishing the strip from its neighbours

That signature alone is NOT sufficient — the workspace sidebar's rows
(Team settings, Issues, Cycles, Projects, Views) are also `9999px` × 28.
The tab pills are separated by TYPOGRAPHY and padding:

| | tab pill | sidebar row |
|---|---|---|
| font | `12px / 500` | `16px / 400` |
| padding | `0 10px` | `5px 8px 5px 6px` |

## The pill

| Property | Value |
|---|---|
| element | `<a>` |
| height | `28px` |
| padding | `0 10px` |
| radius | `9999px` (fully round, not a token radius) |
| font | `12px / 500` |
| width | **content-sized** — measured 75 / 86 / 75 for Overview / Documents / Members. No fixed or equal width. |

### The two states — the same two-rank ramp as the menu glyphs

| | background | text |
|---|---|---|
| selected | `lch(16.706 0.979 272)` | `lch(100 0 272)` |
| unselected | `lch(10.149 0.593 272)` | `lch(61.803 1.2 272)` |

An unselected pill is NOT transparent — it carries its own recessed
fill, and selection is a *lift* of both background and text by one rank
together. Building this as "transparent until selected" is the obvious
wrong reading and produces a strip that looks unanchored.

## Tooltips and hotkeys

**No pill carries `title` or `aria-label`** — verified on all three. So
there is no native tooltip; anything shown on hover would be a custom
layer.

## Not measured

- **Whether a custom tooltip appears on hover, and its text.** Three
  probe attempts failed to land the pointer on a pill (`elementFromPoint`
  returned `none` or a container), so the one run that reported
  "0 nodes added" is NOT trustworthy and is recorded here as unknown
  rather than as a negative result.
- **Whether any keyboard chord selects a tab**, and if so which. Not
  driven.
- **Hover and focus-visible states** of the pill itself.
- **Light theme** — every value above is dark.
- The strip container's own layout (gap between pills): the captured
  parent reported `display: block` with no gap, which means the pills are
  spaced by something other than a flex gap; not run down.
