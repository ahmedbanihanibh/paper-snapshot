# Colour tokens — what Linear actually defines, and what it doesn't

Answers round-3 ask A. Read the negative result first; it changes the plan.

## The negative result

**Linear does not define its ramp as CSS custom properties.** I enumerated all
509 custom properties on `:root` and every `theme-provider` wrapper, then
searched them for each lch value measured across the three spec files:

> 9.232 · 12.72 · 12.141 · 13.861 · 15.966 · 17.349 · 25.68 · 25.834 · 60.621 ·
> 63.304 · 64.714 · 90.826

**Zero hits.** Every one of those is emitted as a literal `lch(...)` by Linear's
atomic CSS compiler into hashed single-purpose classes (`--sx-1uv3w6h: #1d1e20`
and friends — 350+ of them, one per value, machine-named, no semantics). There is
no name to read a role off.

So the mapping you want cannot be lifted from Linear. It has to be *authored*,
using the 12 real tokens below as anchors and the measured values as the ramp.
That is a design decision on our side, not a measurement — flagging it because
it is the opposite of what the ask assumed.

## What IS tokenised — the 12 semantic tokens on `:root`

Dark theme, hue 272 throughout.

| token | value | measured role |
|---|---|---|
| `--color-text-primary` | `lch(100% 0 272)` | active sidebar row label |
| `--color-text-secondary` | `lch(90.451% 1.2 272)` | — |
| `--color-text-tertiary` | `lch(61.803% 1.2 272)` | — |
| `--color-text-quaternary` | `lch(36.975% 1.2 272)` | — |
| `--color-bg-primary` | `lch(5.52% 0.4 272)` | app base |
| `--color-bg-secondary` | `lch(7.32% 0.85 272)` | — |
| `--color-bg-tertiary` | `lch(8.22% 1.3 272)` | — |
| **`--color-bg-quaternary`** | **`lch(9.345% 0.85 272)`** | **row hover wash — exact match** |
| `--color-bg-quinary` | *(empty in dark)* | — |
| `--color-border-primary` | `lch(9.84% 1.48 272)` | — |
| `--color-border-secondary` | `lch(14.16% 1.48 272)` | — |
| `--color-border-tertiary` | `lch(16.32% 1.48 272)` | — |

**One exact hit**: the issue-row hover wash is `--color-bg-quaternary`, not a
one-off. Everything else I measured sits *between* these steps — the group-header
bar at 9.232 is not `bg-tertiary` (8.22) or `bg-quaternary` (9.345); the palette
surface at 12.72 is between `border-primary` (9.84) and `border-secondary`
(14.16). The ramp in use is finer than the ramp that is named.

## Role tokens worth having

On `:root`:

| token | value |
|---|---|
| `--bg-base-color` | `lch(5.52% 0.4 272)` |
| `--bg-color` / `--bg-sidebar-color` | `lch(2.595% 0.4 272)` — sidebar is **darker** than the app base |
| `--bg-border-color` | `lch(14.16% 1.48 272)` |
| `--app-scrollbar-bg` | `lch(37.275% 1.2 272)` |
| `--app-scrollbar-bg-hover` | `lch(37.375% 1.2 272)` |
| `--app-scrollbar-bg-active` | `lch(36.975% 1.2 272)` |
| `--ai-selection-bg` | `lch(61.803% 1.2 272 / 0.1)` |

On the `theme-provider` wrapper (these are the accent):

| token | value |
|---|---|
| **`--focus-ring-color`** | **`lch(47.918% 59.303 288.421)`** |
| `--focus-ring-outline` | `1px solid lch(47.918% 59.303 288.421)` |
| `--app-active-selection-bg` | `lch(47.918% 59.303 288.421 / 0.4)` |
| `--selection-bg` | `lch(61.803% 1.2 272 / 0.2)` |
| `--content-bg-color` | `lch(2.595% 0.4 272)` |
| `--header-color` | `lch(5.52% 0.4 272)` |
| `--header-height` | **`43.5px`** |
| `--editor-text-color` | `lch(90.451% 1.2 272)` |

`lch(47.918% 59.303 288.421)` is the accent, and it is the same value I measured
on the Display panel's toggle knob. The selected-row washes
(`lch(12.141 17.792 286.445)` / `lch(15.966 18.242 286.445)`) share its family
but are **hue 286.445, not 288.421** — close, deliberately not identical, and not
derivable from the accent token by opacity alone. Author them as their own pair.

## Two hues, not one

- **Neutral ramp: hue 272** — every background, border and text value, chroma
  0–1.5.
- **Accent: hue 288.421** at the token; **hue 286.445** for the two selected-row
  washes.
- One outlier: the group-header **count** at `lch(63.304 7 270.292)` — hue
  270.292, chroma 7. Neither ramp. See `issues-list-surface.md` §B5.

If we lint "all neutrals are hue 272", both the selected washes and that count
will trip it. Three families, not one.

## Light mode — partial, and it is not an inversion

Linear ships **explicitly paired** light/dark values for some role tokens, as
raw hex rather than lch:

| token | light | dark |
|---|---|---|
| `--bg-base-color` | `#f9f9fa` | `#121213` |
| `--bg-sidebar` | `#efeff0` | `#09090a` |
| `--bg-border-color` | `#e2e2e2` | `#212224` |
| `--loading-error-secondary-bg` | `#fefeff` | `#1c1c1d` |
| `--loading-error-secondary-hover-bg` | `#f7f7f7` | `#252627` |
| `--loading-error-secondary-border` | `#00000016` | `#ffffff22` |

Two things follow. The light values are **separately authored, not inverted** —
`#f9f9fa` (L≈97.9) against `#121213` (L≈7.0) is not a mirror of the dark ramp
about 50, and the sidebar/base relationship *flips*: in dark the sidebar is
darker than the base (2.595 vs 5.52), in light it is **darker** too (`#efeff0`
vs `#f9f9fa`) — so the sidebar is consistently the recessed surface, but the
delta is 3% in dark and 1% in light. A naive inversion gets the delta wrong.

Also note the border token switches representation: an opaque `#e2e2e2` in
light, a translucent `#ffffff22` in dark. Same role, different compositing
model.

## How it was reached

`getComputedStyle(document.documentElement)` enumerated by index over all 509
custom properties, filtering out the `--sx-*` atomic hashes; repeated on each
`[class*="theme-provider"]` wrapper and diffed against `:root` to isolate what
the wrapper adds. Value hunt done by substring-matching each measured lch
component against every property value.

## Not measured

- **Light mode was not entered.** Everything above is read from the light-suffixed
  tokens *while the app is in dark mode*. The full light ramp — what
  `--color-bg-quaternary` and the twelve `--color-*` tokens become, and whether
  the selected wash keeps chroma 17.8 — is **not measured**. Ask B is therefore
  only half answered: I can say light is separately tuned, I cannot yet give you
  the light values. Switching the theme and re-running every capture is its own
  pass; say the word.
- The `--sx-*` atomic properties were excluded wholesale. If a value I could not
  find turns out to matter, it is in there under a machine name.
- I did not check whether the 12 `--color-*` tokens are redefined per
  theme-provider in light mode, or only on `:root`.
- No token was traced to a Linear-published design-system name. The `primary →
  quinary` naming is theirs; the role mapping in column 3 is mine, from
  measurement, and only one row of it is confirmed.
