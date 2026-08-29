# Colour tokens — light mode

Completes the half of ask B that `color-tokens.md` could not answer: the light
theme entered for real (⌘K → "theme" → Light) and every value re-read live.
Read `color-tokens.md` (dark) first; this file is the diff against it.

Viewport 1432 × 723, DPR 2. Theme state: `document.documentElement.className`
empty (dark mode sets class `dark`; light is the class-less state).

Linear ships **seven themes** (⌘K theme picker): Dark · Light · Custom ·
Pure Light · Magic Blue · Classic Dark · System preference. This file measures
**Light** only.

---

## The headline: light is a different HUE, not an inversion

| | dark | light |
|---|---|---|
| neutral hue | **272** | **282** |
| accent (`--focus-ring-color`) | `lch(47.918% 59.303 288.421)` | `lch(53% 52.26 286.91)` |
| selected-wash hue | 286.445 | **282.518** |
| border chroma | 1.48 | **0** |

Every neutral moves from hue 272 to hue 282, the accent is re-tuned in all
three channels, and borders lose their chroma entirely. Any "invert the L
channel" implementation is wrong four different ways.

## The 12 semantic tokens, both themes

| token | dark | light |
|---|---|---|
| `--color-text-primary` | `lch(100% 0 272)` | `lch(9.794% 0 282)` |
| `--color-text-secondary` | `lch(90.451% 1.2 272)` | `lch(19.588% 1.25 282)` |
| `--color-text-tertiary` | `lch(61.803% 1.2 272)` | `lch(39.176% 1.25 282)` |
| `--color-text-quaternary` | `lch(36.975% 1.2 272)` | `lch(64.64% 1.25 282)` |
| `--color-bg-primary` | `lch(5.52% 0.4 272)` | `lch(97.94% 0.5 282)` |
| `--color-bg-secondary` | `lch(7.32% 0.85 272)` | `lch(92.44% 0.5 282)` |
| `--color-bg-tertiary` | `lch(8.22% 1.3 272)` | `lch(90.94% 0.5 282)` |
| `--color-bg-quaternary` | `lch(9.345% 0.85 272)` | `lch(94.44% 0.5 282)` |
| `--color-bg-quinary` | `0` | `0` (unset both) |
| `--color-border-primary` | `lch(9.84% 1.48 272)` | `lch(95.24% 0 282)` |
| `--color-border-secondary` | `lch(14.16% 1.48 272)` | `lch(88.49% 0 282)` |
| `--color-border-tertiary` | `lch(16.32% 1.48 272)` | `lch(84.44% 0 282)` |

**The bg ramp is not monotonic in light.** Dark orders secondary(7.32) <
tertiary(8.22) < quaternary(9.345) — each step lighter. Light orders
tertiary(90.94) < secondary(92.44) < **quaternary(94.44)** — quaternary (the
hover wash) is the *lightest*, i.e. closest to the page, not the farthest.
Hover in light is a *subtle* wash; a naive "mirror the ramp" makes it the
heaviest. Text L-values pair as 100↔9.794, 90.451↔19.588, 61.803↔39.176,
36.975↔64.64 — roughly mirrored about ~55, not 50, and bg is mirrored about
~51.7. There is no single mirror constant.

## Role tokens that changed

| token | dark | light |
|---|---|---|
| `--bg-color` / `--bg-sidebar-color` / `--content-bg-color` | `lch(2.595% 0.4 272)` | `lch(94.44% 0.5 282)` |
| `--header-color` | `lch(5.52% 0.4 272)` | `lch(97.94% 0.5 282)` |
| `--app-scrollbar-bg` | `lch(37.275% 1.2 272)` | `lch(64.94% 1.25 282)` |
| `--selection-bg` | `lch(61.803% 1.2 272 / .2)` | `lch(39.176% 1.25 282 / .2)` |
| `--ai-selection-bg` | same, /.1 | same light, /.1 |
| `--app-active-selection-bg` | accent /.4 | light accent /.4 |
| `--content-color` | `#6b6f76` | `#b0b5c0` |
| `--content-highlight-color` | `#ffffff` | `#23252a` |
| `--editor-text-color` | `lch(90.451% 1.2 272)` | `lch(19.588% 1.25 282)` |

**Sidebar vs header relationship inverts meaning but keeps recession**: in both
themes the sidebar (`--bg-sidebar-color`) is *recessed* relative to the content
header (`--header-color`) — darker-than in dark (2.595 vs 5.52), darker-than in
light too (94.44 vs 97.94). Delta ≈3 L in bo th. (This corrects the earlier
inference from the paired hex tokens, which suggested deltas of 3% vs 1% — the
live lch values show ~3.5 both ways.)

Stale-at-`:root` oddity: `--bg-base-color` and `--bg-border-color` still
reported dark values on `:root` after the switch — they resolve per
theme-provider wrapper. Read tokens from the **wrapper**, never `:root`, when
verifying a theme.

## The row washes in light — measured on real rows, not tokens

Driven with `j`/`x` on `/team/TES/all` (Ahmed's real issues, 3 status groups):

| state | dark (from issues-scope-rule.md) | light |
|---|---|---|
| hover / cursor | `lch(9.345 0.85 272)` = `--color-bg-quaternary` | `lch(94.44 0.5 282)` = **`--color-bg-quaternary` — the token match HOLDS** |
| selected, unhovered | `lch(12.141 17.792 286.445)` | `lch(92.254 5.903 282.518)` |
| selected + active | `lch(15.966 18.242 286.445)` | `lch(88.754 5.903 282.518)` |

Three things:
1. **The hover wash is `--color-bg-quaternary` in both themes** — that anchor
   is theme-safe. Implement hover as the token, never a literal.
2. **The two-token selected model holds in light**: active stacking shifts L by
   3.5 (−3.5 in light, +3.8 in dark — *away from the page* in both, direction
   flips with theme). Chroma constant within theme.
3. **Selected chroma collapses in light**: 17.8→5.9. A light selected row is
   far subtler than dark. Port the dark chroma to light and selection will
   scream. Selected hue in light (282.518) also sits nearly ON the neutral hue
   (282), unlike dark (286.4 vs 272) — the light selection is a chroma bump,
   barely a hue shift.

## Group header in light

Bar `lch(94.44 0.5 282)` (= bg-quaternary again — same token as dark's
9.232-ish bar? dark bar was 9.232, close to but NOT bg-quaternary 9.345; light
bar IS exactly bg-quaternary. Flag: the dark bar/token near-miss deserves a
re-read). Label `lch(18.888 1.25 282)` /500 (≈ text-secondary), count
`lch(9.794 0 282)` /400 — note the count is *darker* than the label in light,
the reverse of dark's relationship, and the dark count's hue-270.292 outlier
has no light counterpart on this read.

## How it was reached

Theme switched via ⌘K → "theme" → keyboard-select Light (synthetic `click` on
the cmdk option row does NOT fire its select handler — the first two attempts
silently failed; `ArrowDown`+`Enter` works. Trap for every cmdk surface.).
Tokens enumerated over raw CDP `Runtime.evaluate` (`read-theme-tokens.mjs` in
spec-crawler root — reusable), diffed against the dark capture. Washes read
from row `::before` computed styles with selection driven by `j`/`x`.

## Not measured

- The floating surface (palette/menus), shadows, and pill variants in light.
- The other five themes (Custom, Pure Light, Magic Blue, Classic Dark, System).
- Status/priority icon colours in light.
- The dark group-header bar 9.232-vs-9.345 near-miss re-read flagged above.
- Whether `-light`/`-dark` suffixed hex pairs update when the theme flips
  (assumed static, used as cross-check only).

Theme left in **light** at time of writing — captures continuing in light for
the empty-state pass will need this noted; switch back to dark before any frame
meant to match the dark specs.
