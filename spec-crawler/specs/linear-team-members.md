# Linear — team Members tab

Captured 2026-08-24, light, `test-workspace-bb/team/EMP/members`
(`/tmp/members1.mjs`–`members4.mjs`; trees in
`specs/extracted/linear-team-members-tree.txt`).

## Ledger (states + entry paths)

- [x] header — same team header as Documents: title row 44 (favorite ⭐ 28,
      Team actions 28, Copy team URL 28 right) + tab row 44 with the three
      28-high `radius 5` pills (Overview 75 / Documents 86 / Members 75) and,
      right, `Add a member` (123×28 pill, `bg lch(99.997 0.5 282)`,
      `padding 0 10px 0 8px`, 12/500) + `Display options` 28×28.
- [x] column head — 32 high, `padding 0 34px 0 18px`, columns:
      `Name` (A-Z sort button, 24-high round, `pad 0 6px`, label 12/450 muted
      + 12px chevron slot) at x 239 · `Email` at x 990 (col 220) ·
      `Role` at x 1216 (col 140) · 28px trailing slot.
- [x] row — **1203×50**, `padding 0 34px 0 18px`, `align center`, `gap 6`:
      - identity cell 151 wide, `gap 10`, `padding-right 16`:
        avatar **24×24**, `radius 50%`, initials 11px white on the user hue
        (`lch(55 60 40)` here); name **13/500** `lch(19.588 1.25 282)` over
        handle **12/500** `lch(39.176 1.25 282)` (two 16/15px lines).
      - email — 12/450 muted, plain text.
      - role — a CHIP: `height 18`, `radius 2`, `padding 0 5px`, `gap 2`,
        `bg lch(92.44 0.5 282)`, text 12/500 `lch(50 80 288.43)`
        ("Workspace admin" — indigo on lavender).
      - trailing `Open menu` ⋯ — 32×32 round, 16px glyph.
- [x] row hover — walked ancestors: **no background fill found**
      (`rgba(0,0,0,0)` up 3 levels). Suspect: hover may paint deeper or not
      at all; single probe only.
- [x] Add members dialog — **562×168** panel, `radius 12`,
      `bg lch(100 0 282)`, `border 0.5px lch(91.9 0 282)`, heavy dialog
      shadow (`lch(0 0 0/.08) 0 9px 48px, lch(0 0 0/.1) 0 6px …`), three
      56-high sections:
      1. header `padding 16px 48px 16px 16px`: "Add members to <team>"
         15/600 + Close 28×28 round (14px ✕)
      2. body `padding 12 16`: **Select members** combobox — 529×30,
         `radius 8`, white, `padding 0 28px 0 10px`, placeholder
         "Select members…" 13/450, 10×5 caret
      3. footer `padding 12 16`, `gap 8`, right: Cancel 68×32 pill white ·
         **Add members** 112×32 pill `bg lch(53 52.26 286.91)` (#6D78D5 —
         the SAME fill as the selection checkbox, not --primary) 13/500
         white, with the two-stop menu shadow.

## Not measured

- The row ⋯ menu contents — `[role=menuitem]` empty after clicking
  `Open menu` (same portal weirdness as the doc ⋯; needs the text-hit
  fallback used for `Show document history`).
- Row hover fill (see above — one probe, no second shape).
- The Select-members combobox OPEN (options, checkboxes, search).
- Guest / plain member role-chip colours (only one member exists; creating
  a second needs an invite flow that sends real email).
- Empty state (a team with zero members cannot exist).
- Sorting behaviour (A-Z button was not driven).
- Dark theme.
- The Members tab pill's selected state vs the other two.
