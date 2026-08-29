# Linear documents page + team overview — rows, menus, display options (light)

Captured 2026-08-25 via raw CDP on linear.app/test-workspace-bb/team/EMP/*.
Entry paths noted per section. Trusted input via Input.dispatchMouseEvent
(synthetic `contextmenu` events are ignored by Linear).

## Document list rows (`a._rowShared`)

- Row link: full main width (1203 at this viewport), h 48, radius 8px, block.
- Inner flex row: `align-items:center; gap:6px; padding:0 18px`.
- **The hover/selected wash is a `::before` layer**: `position:absolute; inset:0 8px; border-radius:inherit(8px); background:var(--row-applied-bg)` gated by `[data-apply-background="true"]`. So the wash is inset 8px horizontally from row edges — never full-bleed.
- `--row-applied-bg` (selected, light): `lch(94.44% 0.5 282)`.
- Keyboard-active: `box-shadow: 0 0 0 1px var(--row-keyboard-border) inset` where the var = `lch(82.8% 3.2 282.5)`.
- Adjacent selected rows: shared corners squared (first keeps top radius, last keeps bottom).

## Sidebar nav row (e.g. "Issues")

- 177×28 (this width), radius 8px, flex center.
- Rest: bg transparent. Hover: bg `lch(91.64 0.5 282)`; color unchanged.

## Document row context menu (right-click a row) — entry: trusted right click at row center

Container: w 232, radius 12px, bg white `lch(100 0 282)`, border `0.5px solid lch(91.9 0 282)`,
shadow `0 6px 18px lch(0 0 0/.02), 0 3px 9px lch(0 0 0/.04), 0 1px 1px lch(0 0 0/.04)`.
Rows: h 32, pad `0 18px 0 14px`, font 13px/400, color `lch(20 1 282)`, all have leading icons.
Kbd chords: bare glyph text, 11px/500, color `lch(40 1 282)`, NO chip background.
**Delete is NOT red** — same `lch(20 1 282)` as every other row.

Inventory (10 items, 3 separators):
1. Move to… — ⇧P — submenu ▶
2. Pin to overview
3. Duplicate
4. Rename… — ⇧R
— sep —
5. Favorite — ⌥F
6. Copy ▶ (submenu)
7. Remind me — ⇧H — submenu ▶
— sep —
8. Show document history
9. Delete
— sep —
10. Open in desktop app — Ctrl⌘,

### Copy submenu (hover "Copy") — w 270
1. Copy URL — ⌘⇧,
2. Copy title — ⌘⇧'
3. Copy title as link — ⌘C
4. Copy content as Markdown — ⌘⌥C

## Header buttons (documents page, second header row right side)

- "New document" (aria-label same): 126×28 white pill (see linear-team-header-buttons.md).
- "Display options": 28×28 icon button (slider/filter glyph), same icon-button chrome.

### Display options popover (click "Display options")
White card, radius ~12, shadow. Contents top→bottom:
1. Row: "Grouping" label left — pill select `[Project ∨]` right.
2. Row: "Ordering" label left — sort-direction icon button + pill select `[Name ∨]` right.
3. Row: "Show inactive projects" — switch (on).
4. Row: "Show only my projects" — switch (on).
— separator —
5. "Display properties" label, then chip toggle row: [Owner] [Last edited] [Created] (gray pill chips).

## Team overview — "Add resources" (entry: /team/EMP/overview, Team resources section)

Button: 118.7×24 pill, bg `lch(94.854 0.5 282)` gray fill, 12px/500, pad `0 8px 0 6px`, radius full.
Menu (click): w 201, same white/12px-radius chrome as context menu, 1 separator, rows 32h single-line:
1. New document
2. Existing documents ▶ (submenu)
— sep —
3. New link…

## Bulk-select bar (2 rows selected via revealed checkboxes)

- Bar: 253.8×44, radius full, bg white, menu-shadow (3-stop), padding 8, gap 8, floating bottom-center of the content column.
- "Actions" (aria "Open command menu"): 84.4×28 white pill, border transparent, shadow none. "Ask Linear": 28×28 same. "Clear selected": 28×28 transparent.
- Ask tooltip (hover-intent, ~1.1s): **"Ask Linear about 2 documents ⌘⇧J"**.
- Row checkbox tooltip: **"Select document X"** — X toggles row selection.

## Bulk "Actions" command dialog (click Actions)

- Dialog 720w, radius 12, border 0.5px lch(91.9), shadow `0 9px 48px lch(0/.08), 0 6px 24px lch(0/.10), 0 1px 1px lch(0/.04)`, overflow clip. Input 40h 13px/400, placeholder "Type a command or search…".
- List (UL role=listbox) 708w (6px inset per side); rows **46h**, pad 0 12, font 15px/400, icon 16, gap 8/12.
- Focused row highlight: `::before` `inset: 2px 0; border-radius: 8px; bg lch(95 0 282)` — inset plate, never full-bleed.
- Selection commands (then the global create-issue tail): Copy document URLs ⌘⇧, · Copy document titles ⌘⇧' · Copy titles as links ⌘C · Copy document content as Markdown ⌘⌥C · Remind me about these documents… ⇧H · Change document subscribers… ⌘⇧S · Unsubscribe from document updates ⇧S · Pin to overview · Delete document.

## Not measured

- Dark theme for all of the above.
- Move to…/Remind me submenu contents.
- Existing-documents submenu contents.
- Actions/Clear tooltips on the bulk bar (hover probe returned nothing before the selection lapsed).
- Display options popover exact paddings (screenshot-level only).

## ⌘K command dialog — domain awareness (captured 2026-08-25, trusted ⌘K)

On /documents with a row context: first group header is **"Document ⋅ ‹row title›"**
with document-scoped commands: Add document to team overview… · Change owner ⌥O ·
Favorite document ⌥F · Copy document URL ⌘⇧, · Copy document title ⌘⇧' ·
Copy title as link ⌘C · Copy document content as Markdown ⌘⌥C ·
Remind me about this document… ⇧H · Duplicate as new document · Document history ·
Change document subscribers… ⌘⇧S · Unsubscribe ⇧S · Rename document ⇧R ·
Move to… ⇧P · Pin to overview · Delete document — then the global "Issues" tail
(Create new issue… C, …).

On /overview: page-scoped first (Add document to team overview…, Add section…),
then grouped globals (Issues / Projects / Documents / Views / Initiatives),
then **"Team ⋅ ‹team name›"** (Unfavorite team ⌥F), then Filter (Search workspace…).

Architecture: scoped command providers — [focused domain object] + [page actions]
+ [global groups]; one dialog, one registry.

## Copy submenu icons (extracted outerHTML 2026-08-25)

Copy URL = chain-link glyph · Copy title = serif-T glyph · Copy title as link =
T+link compound · Copy content as Markdown = double-document with text lines.
Path data saved into `components/documents/document-menu-glyphs.tsx` (CopyUrlGlyph,
CopyTitleGlyph, CopyTitleAsLinkGlyph, CopyMarkdownGlyph).

## Pinned document row on team overview (image 229, observed)

Its context menu is the SAME document menu identity (Unpin from overview ·
Duplicate · Rename… ⇧R | Favorite ⌥F · Copy ▸ · Remind me ⇧H ▸ | Show document
history · Delete) — one shared menu module, not a resources-specific menu.

## Document row ⋯ menu — full inventory confirmed via user capture (image 230)

Move to ⇧P ▸ (submenu row = team icon + name + key chip "TES" + trailing ✓) ·
Unpin/Pin from overview (label toggles by pinned state) · Duplicate · Rename… ⇧R |
Favorite ⌥F · Copy ▸ · Remind me ⇧H ▸ | Show document history · Delete.

## Move-to picker glyphs (extracted 2026-08-25, live picker over CDP)

- Context menu is a `role=dialog` > `role=listbox` with `role=option` rows —
  NOT menuitem (why earlier probes returned empty).
- Check mark: inline path (now `MoveToCheckGlyph` in
  components/documents/document-menu-glyphs.tsx), 16px, fill lch(40% 1 282),
  margin-right 1px. Marks the current location row.
- Team/workspace row icon: the team's own sprite icon, 14px, team color.
- Project row icon: sprite `#Project`, **16px**, fill lch(48% 59.31 288.43)
  (#5e6ad2). Our `public/team-icons.svg#Project` is byte-identical to
  Linear's symbol — TeamSpriteIcon name="Project" is the extracted glyph.
- Picker rows measured: Filter… input on top, then location rows
  (this workspace groups Teams then Projects; ours: workspace + Projects).

### Not measured
- Picker row hover/selected states beyond the resting frame.
- Teams/Initiatives groups (our product has no team/initiative doc targets).

## Show document history + type-to-filter (Linear-verified 2026-08-25)

- "Show document history" on a LIST row opens the "Restore version for
  ‹doc›" dialog IN PLACE — URL stays on /team/…/documents. Never
  navigates to the document.
- The context menu is a filterable action list: typing shows the query
  above the rows and narrows them; "No matching actions" empty state;
  Backspace edits; the query lives in a floating box above the panel
  (ours renders it as a top strip inside — the content clips).
- Menu row icons (paths diffed against our glyph file): all MATCH except
  Favorite (path replaced) and Remind me (Linear sprite #Alarm, now
  inlined; every reminder preset row carries the same #Alarm icon).

### Not measured
- Unfavorite state's icon in Linear (only the "Favorite" outline row was
  captured; ours shows the filled yellow star when favorited).
- Filter-mode Enter/first-row auto-highlight behavior.

## Measured 2026-08-25 (round 3)

- **Selected row wash is PRIMARY-hued**, not the neutral hover grey:
  `lch(92.254 5.903 282.518)` = rgb(231,232,244) at rest,
  `lch(88.754 5.903 282.518)` = rgb(221,222,234) when also hovered. Hue
  282 = the same hue as --primary; chroma ~5.9 is a whisper, not a fill.
  Tokens: `--row-selected` / `--row-selected-hover`.
- Adjacent selected plates are **flush** (inset `0 8px`, no seam). A 1px
  seam belongs ONLY where a wash meets a group-header band.
- Group-header band: 36px tall, full width, radius 8, tinted gradient.
- **Pinned-resource row (team overview): 40px tall, `padding: 0 12px`,
  radius 8, gap 6, 16px mark, 13px/500 label**, rows on a 2px pitch gap.
  (Ours had been a 28px compact row.)
- Submenu indicator: a `▶` TEXT node at `font-size: 6px`,
  `color: lch(66 1 282)`, in a 16×8 box — a FILLED triangle, never a
  stroked chevron.
- Menu glyphs carry a STATIC fill (`lch(40% 1 282)`) — they do not
  brighten when their row is highlighted.
- Multi-select right-click swaps the menu for a selection-wide one:
  Unpin from overview · Copy ▸ · Remind me ⇧H ▸ · Delete · Open in
  desktop app. Every single-document row (Move to, Duplicate, Rename,
  Favorite, History) is dropped.
- A pinned document shows a small pin glyph at the END of the Name
  column (before Created), with tooltip "Pinned to team overview".

### Not measured
- Dark-mode values for `--row-selected` / `--row-selected-hover` (the
  capture tab was light) — ours are derived, not read.
- The exact tooltip STRINGS for New document / Display options (the tab
  wedged mid-capture); ours use the measured aria-labels.
- Remind me ▸ inside the multi-select menu (we do not fan reminders over
  a selection — named cut).

## Bulk Actions command dialog — full anatomy (measured 2026-08-25, dark)

| Part | Measured |
|---|---|
| Panel | 720w, radius 12, 0.5px border, bg lch(12.72 0.85 272) |
| Context row | h34, `padding: 0 14px`, 15px, muted — copy names the OBJECTS ("2 documents"), while the bulk BAR says "2 selected" |
| Input | h40, 13px, `padding: 11px 112px 11px 12px` — the 112px right inset is the Ask affordance's room |
| Ask affordance | "Ask Linear" + a `Tab` key cap, right-aligned in the input row |
| Rows | h46, `padding: 0 12px`, gap 12, 15px |
| Kbd chips | each glyph its own 20×21 box, radius 3, 0.5px border, 11px, transparent ground — NOT bare glyph text |

Dark selection wash (sampled from Ahmed's own capture, image 266):
**rgb(35,36,46)** = #23242E, against page bg rgb(18,18,19) and hover
rgb(26,26,27). Confirms the derived `--row-selected` dark value.

Move-to picker: the doc's CURRENT location row carries a highlight PLATE,
not just the check glyph.

### Still not measured
- Dark `--row-selected-hover` (no capture shows a selected+hovered row in
  dark) — ours is derived one step lighter, matching the light-mode delta.
- The exact tooltip strings for New document / Display options — ours use
  the measured aria-labels.
