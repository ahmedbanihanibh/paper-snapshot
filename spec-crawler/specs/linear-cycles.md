# Linear — Cycles (enable, sidebar, view) — capture + build (task #77)

Captured 2026-08-24 on `linear.app/test-2-org-ahead` (light) after
ENABLING cycles on the test team (settings/teams/TES/cycles). Frames:
079 (team cycles settings), 080 (cycles view + sidebar row).

## Measured

- Team cycles settings (079): Enable toggle; config rows Cycle duration
  (2 weeks) · Cooldown (No cooldown) · Cycle start (Monday) ·
  Auto-create (2 cycles); "enable estimates" velocity note.
- Enabling auto-creates Cycle 1 + Cycle 2. Sidebar team rows become
  Home · Issues · **Cycles** (+ child "Upcoming") · Projects · Views.
  Cycles glyph EXTRACTED from frame 080 (16×16 arc + play triangle).
- Cycles view rows, newest start first: start date (`Aug 31`) ·
  `Cycle N` · status chip (Planned / Upcoming) · right `0% of capacity`
  · `0 scope`.

## RESULTS (built + driven on localhost)

Cycles are **containers** (`workContainers.kind === "cycle"`) — the
time-boxed kind whose `startAt`/`endAt` already existed; zero new
tables, membership rides `workItemContainers` through the same `move`
plan as projects, cascade already covered.

- `WorkContainerKind` widened with `"cycle"`.
- Extracted `CyclesIcon` in workspace-icons; `TEAM_SURFACES` gained
  Cycles between Issues and Projects (measured order) — renders in the
  team branch AND the favorited-team rail (one component).
- Route `/cycles` registered across the parity lockstep (short-segment
  set, next.config rewrites, static cache keys, KeepAlive) — 30/30
  route-parity tests pass.
- `cycles-content.tsx`: header + Start cycle CTA (mints the next
  Monday-aligned 2-week cycle, chained after the latest when one is
  planned — frame 079 config); rows date · name · status chip
  (Active/Upcoming/Planned/Completed derived from dates) · `done/total
  done · N scope`; rows expand inline to the cycle's issues.
- Issue detail rail: Cycle picker rendered ONLY when the org has
  cycles — the same both-ways 1:1 as Linear omitting the row in a
  cycle-less workspace.

Driven: Start cycle → "Aug 31 · Cycle 1 · Upcoming · 0/0 done · 0
scope"; PB-12's rail grew the Cycle row → picked Cycle 1 → row shows
"Cycle Cycle 1"; cycles page shows "0/1 done · 1 scope" and expanding
lists PB-12.

## Named deferred / gated

- `% of capacity` needs an estimates plane (gated; we show done/scope).
- Auto-create cron + cooldowns (manual Start cycle instead; config
  surface not built).
- Sidebar "Upcoming" child row under Cycles; cycle board/display
  options (→ #69 list module); ⇧C palette + ctx-menu Cycle ▸ row
  (rail picker ships the property; palette/menu follow when the org has
  cycles — next slice).
- Team cycles settings page in OUR settings shell.

## Not measured

- Active-cycle row styling (test workspace had only future cycles).
- Cooldown rendering; completed-cycle archive behaviour; the cycle
  DETAIL page Linear opens from a row.
