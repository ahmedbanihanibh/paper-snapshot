# Dashboard Drafts — parity with the shipped editor drafts (PHASE 1)

2026-08-24. Reference = OUR shipped editor drafts surface
(`/p/{pid}/v/{vid}/editor/drafts`, `components/work-items/
drafts-content.tsx`), itself measured against Linear (Paper 1IEH-0 card
grid / 1IF6-0 card anatomy). Approval: Ahmed's directive verbatim —
"the drafts here page must be like the shipped drafts, in the editor
app with all its animation, and the create issue dialog in dashboard
when save to draft then animation the dialog to go to the drafts."

## State ledger (entry paths)

| state | entry | notes |
|---|---|---|
| not-yet-loaded | hard reload /dashboard/drafts | workStates sentinel gates empty-art (≠ empty) |
| empty | delete all drafts | measured empty art, no invented copy |
| one / many | save drafts from the dashboard composer | 3-col 140px cards, 16px gap, virtualized |
| overflowing | >18 drafts | grid virtualizer scrolls |
| hover | pointer over card | trash reveals (extracted Linear glyph) |
| card click | click a card | composer reopens WITH the draft, origin-aware (dialog flies back to the card on close) |
| save-as-draft exit | composer → Save as draft | dialog exit animation toward the drafts destination (the editor's choreography — shared OpenIssueDialog owns it) |
| discard one | trash → DraftDiscardConfirm | on-open data-show-ring (just unified with composer confirm) |
| discard all | header Discard-all button | shared `DiscardAllDraftsButton` |
| both themes | toggle | token-driven; verify dark + light |
| narrow | ~900px | grid column behavior follows the editor mount |

## IN / OUT / PRESERVE / TASTE

- IN: replace the placeholder `components/dashboard/drafts-content.tsx`
  body with the SHARED `components/work-items/drafts-content.tsx`
  module (one drafts surface, two mounts — deep-module rule; never a
  fork), plus a header row carrying `DiscardAllDraftsButton`.
- OUT (named): version-scope chips — the dashboard mount has no
  version context, so `projectId`/`versionId` are omitted and the
  composer opens org-scoped. The editor mount keeps its chips.
- PRESERVE: the `/drafts` cache key + route + sidebar row; the
  placeholder's docblock decision is superseded by Ahmed's directive
  (drafts = work-item composer drafts).
- TASTE: none new — everything inherits the measured editor surface.

## DONE =

1. tree-diff: the drafts CONTENT region of the dashboard mount vs the
   editor mount at the same viewport — structurally identical minus the
   named scope chips.
2. drive: save a draft from the dashboard composer → card appears on
   /dashboard/drafts; click reopens the composer with the content;
   trash → ring → confirm → card gone; empty state after last delete.

## Not measured

- The save-as-draft exit animation's exact curve on the DASHBOARD mount
  (the shared dialog owns it; verify it plays, don't re-derive timing).
- Narrow-viewport column drop (inherits; not re-verified here).

## RESULTS (2026-08-24, PHASE 3)

- Structure: **91 of 91 nodes identical** to the editor reference tree
  after normalizing shell-offset geometry (`spec-bundle/extracted/
  {editor,dashboard}-drafts-tree.txt`; the raw tree-diff keys on
  absolute y and false-negatives across shells — normalize with the
  sed in this session or diff at identical scroll offsets).
- Driven green: C opens the composer on /dashboard/drafts · Save as
  draft → "Issue draft saved" toast + card appears (visible-scoped
  probe; KeepAlive keeps hidden pages in DOM — UNSCOPED counts lie) ·
  dialog exits WITH motion (transform/opacity sampled mid-flight;
  `flyToTarget("[data-drafts-nav]")` degrades to instant close when the
  host has no drafts nav row — NAMED: the dashboard sidebar Drafts row
  needs `data-drafts-nav` for the full fly, see below) · card click
  reopens the composer with the draft (run x45) · trash →
  data-show-ring=true confirm → card removed.
- Instrument lessons: React inputs need native-setter + input event
  (bare CDP chars leave React state stale → `dirty` false → save
  no-ops); the drive helper drops SPACE chars for mapped keys.

## Follow-up (named)

- Tag the workspace sidebar Drafts row with `data-drafts-nav` so the
  save-as-draft fly targets IT on dashboard pages instead of the
  instant-close fallback.
