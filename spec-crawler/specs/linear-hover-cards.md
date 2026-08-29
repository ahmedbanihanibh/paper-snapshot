# Linear hover cards — per-domain inventory

Captured 2026-08-25 over CDP (dark), by walking a real pointer path into
the target and waiting past the open delay. A single `mouseMoved` does
NOT open these — the card only mounts after a multi-step pointer path
lands on the trigger (entry path recorded below; a probe that skips it
reports "nothing mounted" and looks like the card doesn't exist).

## The SHARED chrome — identical across every kind measured

| Property | Value |
|---|---|
| radius | `8px` |
| background | `lch(12.72 0.85 272)` — the same ground as a menu surface |
| border | `0.5px lch(25.68 1.93 272)` |
| shadow | `lch(0 0 0 / 0.3) 0px 0.5px 1px 1px` |
| outer padding | `0` |
| inner frame | `display:flex; flex-direction:row; gap:8px; padding:5px 8px` |
| content column | `display:flex; flex-direction:column; gap:6px` |
| width | **sizes to content** — 208 / 237 / 272 measured, no fixed width |

This is why one card module is right and six are not: the chrome does not
vary. What varies is the HEADER shape and the DETAIL rows.

## Per-domain bodies

### Member (208 × 168) — entry: hover the Owner cell's name
- **Header**: row, `padding: 4px`, `32×32` avatar + a two-line identity
  column (`141×33`): display name then handle.
- **Detail**: column, `gap: 8`, `padding: 12px 4px 6px`, **no divider**.
  Four rows, each `display: grid` (icon + text), 16–18px tall.
  Observed rows: presence dot + "Online" · clock + local time · teams ·
  projects (`Test +1` — overflow is a `+N` suffix, not a wrap).

### Document (272 × 78) — entry: hover a favorites-sidebar document row
- **Header**: row, `gap: 6` — 16px sprite `#Page` + title `13px/500`
  `lch(100 0 272)`.
- **Detail**: column, `gap: 8`, `padding-top: 10`,
  **divider `border-top: 0.5px lch(34.32 1.93 272)`**. ONE row, 16px,
  `gap: 6` — "Last edited <date> by <person>".

### Workspace / team (237 × 61) — entry: hover a workspace row
- Same chrome; single-line header + one detail row. Shortest card.

## Two chrome FAMILIES (corrected 2026-08-25 after capturing all six)

An earlier pass claimed the chrome was identical across kinds. With all
six measured it is not — there are TWO families, and they differ in
shadow, padding and how the detail area is laid out. Everything else is
shared.

|  | ROW card | ENTITY card |
|---|---|---|
| kinds | member · document · workspace | project · initiative · status |
| shown from | a row/cell in a list or rail | a picker/menu row |
| shadow | `0 .5px 1px 1px lch(0 0 0/.3)` (tight) | `0 4px 40px lch(0 0 0/.1), 0 3px 20px lch(0 0 0/.125)` (soft, 2-stop) |
| padding | inner frame `5px 8px` | `6px`, and again `6px` on the content column |
| detail area | rows STACKED, `gap: 8` | a WRAPPING CHIP ROW, `gap: 12px 16px` |

Shared by both: `radius 8` · bg `lch(12.72 0.85 272)` · border
`0.5px lch(25.68 1.93 272)` · content column `flex column gap 6` ·
divider `0.5px lch(34.32 1.93 272)` with `padding-top: 10` riding the
detail block's top edge · width sizes to content.

## Per-domain bodies

### Member — 208×168 · ROW family · entry: hover an Owner cell's name
- Header: `padding: 4px`, `32×32` avatar + two-line identity (name, handle).
- Detail: `gap 8`, `padding: 12px 4px 6px`, **no divider**, four `grid`
  rows: presence + "Online" · clock + local time · teams · projects
  (overflow is a `+N` suffix, never a wrap).

### Document — 272×78 · ROW family · entry: hover a favorites doc row
- Header: `gap 6` — 16px `#Page` + title `13px/500 lch(100 0 272)`.
- Detail: divider, ONE row `gap 6`, 16px: "Last edited <date> by <who>".

### Workspace — 237×61 · ROW family
- Single-line header + one detail row. The shortest card.

### Project — 380×150 · ENTITY family
- Title row `gap 6`: 16px `#Project` + `13px/500 lch(91.178 1.425 272)`.
- Description: `12px/450 lch(64.714 1.425 272)`, clamped (2 lines).
- Chip row `gap 12`: status chip (inline 16px glyph + `12/450` BRIGHT) ·
  workspace (`#Bank` **12px** + bright) · priority (`12/450` MUTED).
- Progress row `gap 6`: `54%` bright · `of` muted · `13` bright.

### Initiative — 233×80 · ENTITY family
- Title row: 16px `#Initiative` + `13px/500`.
- Chip row under the divider, `gap: 12px 16px`, `padding-top: 10`:
  `Active` (bright) · `No priority` (muted).

### Status — 309×77 · ENTITY family
- Title row `gap 6`: **14px** inline status glyph + `13px/500`.
- Chip row under the divider, `gap 16`: `Started` (14px glyph + bright) ·
  workspace (`#Bank` 12px + bright).

## The colour rule inside a card

Chip text is `12px/450` in exactly two ranks: `lch(91.178 1.425 272)`
when it is the fact the card is ABOUT (status, workspace, progress
numerator) and `lch(64.714 1.425 272)` when it is a qualifier
(priority, the word "of", a description). Same two ranks as the menu
glyph ramp — the reference reuses its ramp everywhere.

## Entry-path traps (both cost a probe run)

1. A single synthetic `mouseMoved` does NOT open these. The card mounts
   only after a multi-step pointer path lands on the trigger. A probe
   that skips it reports "nothing mounted" and reads as "no such card".
2. Two floating layers sit on these triggers: the hover CARD and a plain
   TOOLTIP (radius 14, black ground, 3-stop shadow). Matching "the newest
   floating box" returns the tooltip about half the time — match on
   `border-radius: 8px` plus the trigger's own text.

## LIGHT THEME — the ROW family, measured 2026-08-26

Captured by switching Linear to light (`localStorage['website-theme']`,
restored to `system` afterwards) and hovering a favourites-sidebar
document row — the spec's own entry path. Card measured 237×61, i.e. the
workspace/document row card.

| Property | light | our token |
|---|---|---|
| background | `lch(100 0 282)` | `--menu-bg: #FFFFFF` ✓ |
| border | `0.5px lch(91.9 0 282)` | `--menu-border: #E8E8E8` ✓ |
| radius | `8px` | ✓ |
| shadow | `lch(0 0 0/.02) 0 3px 6px -2px, lch(0 0 0/.04) 0 1px 1px 0` | `--frame-shadow` ✓ **exact** |

**All three already matched.** The light row-card values in
`globals.css` were genuinely measured at some earlier point, not
inverted from dark — worth recording, because the suspicion going in was
the opposite. The light shadow is a soft 2-stop lift; the dark one is
the tight `0 0.5px 1px 1px`. The two themes carry genuinely different
shadows, which is exactly why inverting would have been wrong.

## Not measured

- Light-theme values for the ENTITY family (project / initiative /
  status). The ROW family is now captured (above). The entity card is
  reached from a PICKER/menu row, not a list row: hovering a project row
  in `/projects/all` and a status chip both produced no card in light on
  2026-08-26. The likely path is an issue's Project or Status field
  dropdown, hovering a row inside it. Until then
  `--entity-card-shadow` in light is the DARK measurement copied, and is
  labelled as unverified in `globals.css` rather than presented as
  measured.
- Open/close delays and the pointer-grace corridor between trigger and
  card.
- The ISSUE card (Linear shows one on issue references) — not captured;
  we have no issue-reference surface yet, so it is not blocking.
