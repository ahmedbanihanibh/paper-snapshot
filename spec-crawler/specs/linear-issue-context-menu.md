# Linear — issue row context menu

Captured 2026-08-24 over CDP: right-click TES-68 on
`linear.app/test-workspace-bb/my-issues/assigned`. Dialog **180×573**.
Submenu inventories + 32 extracted icons in
`spec-bundle/extracted/issue-ctx-{menu,submenus,submenu-icons}.json`.

## Control inventory (16 rows, DOM order, with chords)

| # | row | chord | submenu | in ours |
|---|---|---|---|---|
| 1 | Status | S | ▶ | ✓ (states + icons + current-check) |
| 2 | Priority | P | ▶ | ✓ |
| 3 | Assignee | A | ▶ | ✓ (No assignee + members) |
| 4 | Due date | ⇧D | ▶ | ✓ (captured presets + Custom… calendar; NL input in the dialog) |
| 5 | Labels | L | ▶ | ✓ (toggle plan; 9px label-color dots) |
| 6 | Project | ⇧P | ▶ | ✓ (project containers via move plan) |
| 7 | Cycle | ⇧C | ▶ | FEATURE-GATED — no cycles plane. Measured precedent: Linear itself omits this row in a cycle-less workspace, so omission IS the 1:1 behaviour for our plane state. |
| 8 | More properties | | ▶ | ✓ Rename ⇧R (routes to details). DEFERRED inside: Add link… / Add document… (planes exist; picker UI not built — next slice of #59). |
| 9 | Create related | | ▶ | ✓ (composer prefill + inverse-verb relation on ack) |
| 10 | Mark as | | ▶ | ✓ (6 verbs × searchable issue picker) |
| 11 | Copy | | ▶ | ✓ all 9 captured rows |
| 12 | Convert to | | ▶ | DEFERRED — conversion targets (project/document) need a convert operation on the work plane; no plan authored yet. |
| 13 | Open in | | ▶ | FEATURE-GATED — no desktop app to open in. |
| 14 | Favorite | ⌥F | | ✓ (favorites plane, `issue` kind) |
| 15 | Remind me | ⇧H | ▶ | ✓ (born-snoozed notification; ReminderPresetContent) |
| 16 | Delete | ⌘⌫ | | ✓ (snapshot Undo; plain foreground color per capture) |

Ours ships **13 of 16** rows. Not shipped, named: Cycle (gated — omission
matches the reference's own cycle-less behaviour), Convert to (deferred,
reason above), Open in (gated). Separator groups per capture:
[1–8] | [9–13] | [14–15] | [16] — ours renders the same groups.

## Copy submenu (captured, 271×269)

All 9 rows shipped: Copy ID ⌘. · Copy URL ⌘⇧, · Copy title ⌘⇧' ·
Copy title as link (HTML clipboard flavor) · Copy description as
Markdown · Copy content as Markdown · Copy git branch name · Copy as
prompt · Make a copy (prefilled composer).

## Chord bindings (drive-checked 2026-08-24, 15 of 15 pass)

Every chord the menu DISPLAYS is bound on the issues list key handler
(`spec-bundle/drive-issue-chords.mjs` is the gate):

- S / P — property palettes (pre-existing, measured placeholders).
- A / L / ⇧P — palettes over members / labels / project containers.
- ⇧D — due-date calendar dialog for the cursor row.
- ⇧R — details route (ABSOLUTE path; relative `issues/…` compounded
  under `issues/assigned` — caught by the gate, fixed both in the chord
  and the menu's onRename).
- ⇧H — ReminderPresetPanel anchored at the cursor row. The NL input
  autofocuses and the window key handler skips INPUT targets, so the
  panel wrapper handles its own Esc (gate caught the swallowed Esc).
- ⌥F — favorite toggle via the by-id favorites toggler
  (`useFavoriteToggler`, same seam as the menu's fixed-target hook).
- ⌘. / ⌘⇧, / ⌘⇧' — copy ID/URL/title, matched on `event.code`
  (shift mutates `key`: ⇧, arrives as `<`).
- ⌘⌫ — delete with snapshot Undo.

## Keyboard property palettes (MEASURED 2026-08-24 — closes the earlier
## Not-measured entry)

Captured live: hover TES-68 on my-issues/assigned, press each chord.
File: `spec-bundle/extracted/linear-property-chord-palettes.json`;
probe: `spec-bundle/capture-linear-property-chords.mjs`.

| chord | placeholder | box | rows (digits are chips) |
|---|---|---|---|
| S | `Change status…` | 708×334 | Backlog¹ Todo² In Progress³ In Review⁴ Done⁵ Canceled⁶ Duplicate⁷ |
| A | `Assign to…` | 708×256 | No assignee⁰ · members¹… · `Cursor` (agent) · `Invite and assign…` |
| L | `Add labels…` | 708×302 | label rows (no digits) |
| ⇧P | `Add to project…` | 708×302 | No project⁰ · projects · `Create new project…` |

Adopted in ours: all four placeholders verbatim (L was shipped one
session as "Change labels…" — corrected to the measured `Add labels…`),
digit chips on No assignee⁰/members¹⁻⁹/No project⁰. NAMED DEFERRED
rows: `Invite and assign…` (invite flow exists but no inline
invite-then-assign pipeline), `Create new project…` (no inline
project-create), the agent assignee row (our delegate rides the D
palette instead — named divergence).

## State ledger (menu + palettes; entry paths)

| state | entry path | status |
|---|---|---|
| closed → open | right-click a row | ✓ built + driven |
| open, hover row | move over rows | ✓ (foreground/10 wash) |
| submenu open | hover a ▶ row | ✓ (WorkSubmenu escapes .wi-surface clip; elementFromPoint-verified) |
| submenu search filtered | type in submenu input | ✓ |
| submenu filtered-to-nothing | type garbage | ✓ empty list, no invented "No results" copy (reference shows bare empty — captured in submenu inventory) |
| long labels | labels/projects with long names | ✓ truncate; submenu max-h 360 scrolls |
| keyboard palettes (S/P/A/L/⇧P) | chords from list | ✓ driven 15/15 |
| palette filtered-to-nothing | type garbage in palette | ✓ (palette family behaviour, shipped pre-#59) |
| current-value check | Status submenu on an issue | ✓ check on current state |
| disabled rows | none observed in reference | n/a (none built — matching) |
| in-flight / failed-write | Zero writes are 0ms optimistic; rejection path = blocked-relation toast | ✓ (plan.rejection) |
| post-delete focus | ⌘⌫ then J/K | ✓ cursor moves to neighbor |
| dark theme | captured + built | ✓ |
| light theme | localStorage theme=light, reopen menu | ✓ chrome from the extracted frame (see Not-measured strike-through); Esc-at-each-depth also driven |
| narrow viewport | menu near viewport edge | ✓ clamped position; submenu flips via fixed positioning |
| multi-selected + right-click | select rows, right-click | ✗ not captured (below) |

## Not measured

- Row px anatomy of the reference menu (the 180w dialog uses the same
  command-list rows as the inbox menus — 32px assumed from that family,
  not re-measured here).
- ~~Multi-selection right-click~~ MEASURED 2026-08-24 (select 2 via
  hover checkboxes → "2 selected" → right-click a selected row; file
  `spec-bundle/extracted/linear-multiselect-ctx-menu.json`): same menu
  anatomy PLUS a `Move ▶` row (after Copy), 15 rows; the menu scopes
  its actions to the SELECTION. Adopted: property rows + Labels +
  Project + Delete target every selected id when the clicked row is in
  the selection; Delete = one toast `Deleted N issues` with one Undo
  restoring all. Move ▶ FEATURE-GATED (moves between teams; no team
  plane). NOT measured within this state: whether Favorite/Remind
  me/Copy act on all selected or the clicked row (ours: clicked row);
  whether ⌘⌫ with a selection deletes the selection (ours: cursor row).
- ~~Light theme~~ MEASURED 2026-08-24 via the extracted HTML+CSS frame
  (`spec-bundle/frames/043-team-actions-menu-light.html`, captured with
  the spec-crawler MCP `capture_component`): surface bg lch(100 0 282),
  border 0.5px lch(91.9 0 282), radius 12, shadow
  .02/6/18 + .04/3/9 + .04/1/1. `.wi-surface` now reads per-theme
  tokens (`--work-surface-border/-shadow`) citing this frame; ours
  validated equal by computed-style diff. Row text lch(20 1 282), icons
  lch(40 1 282) — matching what the menu already used.
- The L palette's row anatomy detail (color dot size in the PALETTE —
  ours reuses the ctx submenu's measured 9px dot; the palette's own dot
  not measured).
