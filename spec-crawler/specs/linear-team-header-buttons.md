# Linear team pages — header pills, tabs, buttons (light theme)

Captured 2026-08-25 via raw CDP (port 9222) on
https://linear.app/test-workspace-bb/team/EMP/documents and /overview.
Method: `getComputedStyle` probes + `CSS.forcePseudoState` hover +
clip screenshots (scale 2, tab foregrounded — background tabs return
stale gray compositor frames).

## Canvas

- `main`: bg `lch(97.94 0.5 282)` (light gray), border `0.5px solid lch(89.84 0 282)`, radius `12px`, margin `8 8 8 0`.
- Every "bordered-looking" pill in the header is actually a **white pill on this gray canvas** — computed border color is transparent on all of them.

## Tab pills (Overview / Documents / Members) — `<a>`

- h 28, radius 9999px, padding `0 10px`, font `12px/500`, gap between pills 8px (parent row `gap:8`, each in `r:5px` wrapper).
- Inactive: bg `lch(99.997 0.5 282)` (white), color `lch(39.176 1.25 282)` (muted).
- Active: bg `lch(93.483 0.5 282)` (gray fill), color `lch(9.794 0 282)` (near-black).
- Border: `0.5px solid transparent` (never paints a color).

## "New document" pill button

- 127×28, radius 9999px, padding `0 10px 0 8px`, font 12px/500, icon 14×14 with mr 6.
- Rest: bg `lch(99.997 0.5 282)` white; Hover: bg `lch(95.883 0.157 282)`.
- border 1px solid transparent; box-shadow none.

## 28×28 icon buttons (favorite ☆, notify switch, filter/display, "Open command menu")

- 28×28, radius 9999px, padding `0 2px`, border 1px solid transparent.
- Rest: bg transparent, color `lch(19.588 1.25 282)`.
- Hover: bg `lch(94.854 0.5 282)`, color `lch(9.794 0 282)`.

## Porting decision (Ahmed, plan items 1,2,4,8,9,12)

Our team pages render on a WHITE canvas, so the white-on-gray contrast that
reads as a border in Linear vanishes. Per Ahmed's explicit direction these
buttons get a real hairline: `border border-input` (`rgb(226,226,226)` in
light — the exact value his pins measured) + `bg-card`. Geometry (28h,
rounded-full, 12px/500, px) copied from the numbers above.

## Not measured

- Dark theme values (this workspace session is light; dark derived from our
  semantic tokens, flagged for later capture).
- Focus-visible ring on these pills.
- Pressed/active state.
