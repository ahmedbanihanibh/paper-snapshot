# Linear — destructive confirm dialog + the destructive button

Captured 2026-08-24, `test-workspace-bb`, **both themes**, via `/tmp/red-final2.mjs`
and `/tmp/dark6.mjs`. Hex values converted in-page through a 1×1 canvas
(`fillStyle = <lch>` → `getImageData`), not by hand.

**Entry path** — ⌘K → type `Delete document` → Enter. (The earlier attempts via
the issue composer's Escape/discard flow were unreliable: the row order in the
palette is recency-sorted, so clicking a remembered y hits a different action.
Match rows by label, or type a query specific enough to make the target row
first and press Enter.)

## The button family

| | **light** | **dark** |
|---|---|---|
| destructive rest fill | `#F34E52` | **`#F34E52` — identical** |
| destructive hover fill | `#E33F47` (darker) | **`#FF5C5D` (lighter)** |
| destructive label | `#FFFEFF` | `#FFFEFF` |
| focus ring | `outline: 1px solid #E33F47`, `outline-offset: 2px` | `1px solid #FF5C5D`, offset 2px |
| secondary ("Cancel") rest fill | `#FFFFFF` | `#2A2B2C` |
| secondary hover fill | `#F3F3F3` | `#343537` |
| secondary label | `#303032` | `#E5E6E8` |
| secondary shadow | **none** | **none** |
| secondary border | `0.5px solid transparent` | `0.5px solid transparent` |

### A parked pointer poisons every "rest" reading

Cancel first measured `#FFFFFF`, then `#F3F3F3` on a later run, with no
explanation. Neither was wrong: an earlier probe had moved the pointer onto
Cancel and **left it there**, and the dialog reopened at the same coordinates,
so the "rest" read was a hover read. Confirmed by parking the pointer at
`(40,600)`, reading, hovering, reading, parking again — `#FFFFFF` → `#F3F3F3`
→ `#FFFFFF`, with `matches(':hover')` agreeing each time.

**Park the pointer and assert `:hover === false` before recording any rest
value.** CDP has no "pointer leave" — the last `mouseMoved` persists across
navigations, reloads and script runs.

Note also: our `linearSecondary` currently paints a **3-stop box-shadow**. The
reference has **none**, in both themes.

Shared by both: `border-radius: 9999px` (full pill) · `height 32` ·
`padding 0 12` · `font 13px / 500` · `border: 0.5px solid transparent` ·
`box-shadow: none`. Delete measures 65×32, Cancel 68×32 — width is intrinsic.

### The two things an inversion would have got wrong

1. **The rest fill does not change between themes.** A "dark red for light, light
   red for dark" pair would be wrong in both.
2. **Only the hover DIRECTION flips** — darker on light, lighter on dark. This
   is the tell that the family is authored per-theme rather than derived.

### The ring is the hover fill

The focus outline is not a separate colour: it is exactly the hover fill, drawn
as a **1px hairline at `outline-offset: 2px`**. On a red pill against a white
sheet that reads as the red halo in a screenshot — but it is a hairline, not a
glow, which matches our own `pb-design/no-focus-ring-glow`.

Both buttons carry `outline-color` at rest (`3px none` on Cancel, i.e. declared
but not drawn) — so reading `outlineColor` alone does not tell you a ring is
visible. `outlineStyle` is the discriminator.

### Independent cross-check

A sweep of Linear's own CSS custom properties for red-ish values
(`/tmp/red8.mjs`) returned `--sx-i20l48 = #f34e52` and `--sx-17ckey5 = #e33e46`
— the same two values reached from a completely different direction.

## Not measured

- Pressed/`:active` fill.
- Disabled destructive.
- The dialog panel's own box (width, radius, ground, shadow, padding): the
  probe walked to an ancestor that filled the viewport (1432×723), so the panel
  itself was never isolated. Needs a scoped selector, not an ancestor walk.
- Destructive **text** links / menu rows (e.g. a red `Delete` row in a ⋯ menu) —
  whether they use the same `#F34E52` or a text-specific variant.
- The `Classic Dark`, `Pure Light`, `Magic Blue` and `Custom` themes, which the
  palette also offers.
- Whether a destructive toast/undo uses the family.
