# Team resources — the "+" (Add resources) popover, and the header button pair

Reference: `linear.app/test-48bd-dd25/team/TES/overview`, DARK theme,
Chromium (debug browser :9222). Captured 2026-08-28 by raw CDP —
`scratchpad/ref-plus2.mjs` .. `ref-sep2.mjs`.

Entry path: navigate to the team overview; the buttons sit on the
**"Team resources" heading row**, not on each section header.

## The header button pair

Both are **always visible** — `opacity: 1` with the pointer parked far
away (1200,720). They are NOT hover-revealed.

| | Add resources | Add section |
|---|---|---|
| box | 28 x 28 | 28 x 28 |
| radius | `9999px` | `9999px` |
| centre | (990, 247) | (1022, 247) |
| right edge | 1004 | 1036 = header row right |
| icon | 16x16 viewBox `0 0 16 16` | 16x16 viewBox `0 0 16 16` |

Gap between them: 4px (1004 → 1018 left edge of the next).
Header row: x 338, y 233, 698 x 28.

**"Add section" opens NO overlay.** It appends an inline, autofocused
text input `placeholder="Section name"` (108 x 24) at the end of the
resource list. Measured: `overlay: null`, `inputs[].focused: true`.

## The popover the "+" opens

Surface (the `role="listbox"`): **201 x 120**.

- `right` = 1004 = the button's right edge exactly (**align end,
  delta 0**).
- `top` = 266 = the button's bottom (261) **+ 5** (sideOffset 5).
- 6px vertical padding, carried by a spacer DIV rather than `padding`.
- **No filter input** (`input: null`) and **no "Showing all items"
  header** — the panel is three rows and a separator, nothing else.

### Rows — the full inventory, in order

1. `New document`
2. `Existing documents` ▶ (submenu)
3. — separator —
4. `New link…`

Row anatomy (measured on row 1):

- `li[role="option"]`: full-bleed **201 x 32**, padding `0 18px 0 14px`.
- inner plate DIV: x 809, w 189 → **6px inset each side**,
  `border-radius: 8px`. This is the element that wears the hover wash.
- icon: 16x16 at x 817 (14px from the surface's left edge).
- label: 13px / weight 450, starts x 841 → 8px gap after the icon.

### The separator — a SHARED value, two samples

`role="separator"`, `padding: 6px 0`, containing a **0.5px** line at the
surface's **full width** (no horizontal inset). Total block **12.5px**.

Confirmed on a second, unrelated menu: the section right-click menu
(174 wide, rows `Add resources ▶` / `Copy link` / `Rename…` /
`Delete…`) — separator identical at `padding: 6px 0`, 0.5px, full-bleed
174 wide. Two independent samples is why this landed on the shared
primitives rather than on the one menu that surfaced it.

## Ours, before the fix (localhost:3000, same viewport)

| | reference | ours (before) |
|---|---|---|
| button box / radius | 28x28 / round | 28x28 / round ✓ |
| popover width | 201 | 211 |
| sideOffset | 5 | 4 |
| separator block | 12.5px | 9px |
| separator line | 0.5px, full-bleed | 1px, inset 10px |
| rows | 32h, 6px inset plate, radius 8 | 32h, ~6px inset ✓ |

Fixed: sideOffset 4 → 5; separator → `my-1.5 h-[0.5px]` full-bleed in
all THREE separator primitives (`ui/dropdown-menu`, `ui/context-menu`,
`ui/linear/dropdown-menu`, which all carried the same wrong value).

## Not measured

- **Light theme.** Every number above is dark-only. The geometry is
  theme-independent, but the separator and plate COLOURS are not, and
  were not captured in light.
- **The 10px width gap.** Ours reaches 211 where the reference reaches
  201, both `w-auto`-style. The reference's row is genuinely narrower;
  which of (icon box, icon→label gap, right padding, submenu chevron
  reserve) carries the 10px was not isolated. NOT fixed by clamping the
  panel — `pb-design/no-fixed-width-menu` bans that, correctly, because
  a fixed width clips the first label that outgrows it.
- **The "Existing documents ▶" submenu's own popover** opened from the
  "+" path (the ⋯ path's submenu was measured earlier at 211x118).
- **Hover / focus / selected row wash colours** in this popover. The
  plate element and its radius were measured; its lit background was
  not — the probe read the resting value.
- **"Add section" beyond the input's existence**: commit-on-Enter vs
  blur, Escape behaviour, empty-name handling, and where the new
  section lands are all unverified.
- **The "+" icon's own hover treatment** (the reference's rest colour
  is `lch(61.803% 1.2 272)`; ours deliberately departs — muted at rest,
  foreground on hover, at Ahmed's direction 2026-08-26).
