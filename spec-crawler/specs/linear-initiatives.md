# Linear — Initiatives (enable, sidebar, view) — capture + build (task #78)

Captured 2026-08-24 on `linear.app/test-2-org-ahead` (light) after
ENABLING initiatives (settings/initiatives toggle). Frame 085
(initiatives empty view + sidebar). One wedged tab recovered via raw
CDP close/new during the sweep.

## Measured

- Enabling adds an `Initiative labels` settings row and the sidebar
  Workspace group becomes **Initiatives** · Projects · Views
  (Initiatives FIRST). Glyph EXTRACTED (16×16 peak inside an open arc).
- `/initiatives/active`: header "Initiatives" + [New initiative] CTA +
  tabs Active / Planned / All initiatives; empty-state copy
  "Initiatives are larger, strategic product efforts that set the
  direction of your company. They are comprised of the projects that
  get you there."

## RESULTS (built + driven on localhost)

Initiatives are **containers** (`kind === "initiative"`, goal-boxed —
dates null); PROJECT containers join one via `parentContainerId`, the
"roadmap's children" link the container row was designed with. Zero new
tables.

- `WorkContainerKind` widened with `"initiative"`; extracted
  `InitiativesIcon`; sidebar Library/Workspace group leads with
  Initiatives (measured position); `/initiatives` registered across the
  route-parity lockstep (30/30 pass).
- `initiatives-content.tsx`: header + New initiative (inline name
  draft), reference empty-state copy verbatim, rows with project
  counts, expansion showing member projects (+ issue counts + Remove)
  and an `+ Add project` picker (shadcn DropdownMenu) that sets
  `parentContainerId` via typedMutate.

Driven: New initiative → typed "Q1" → row "Q1 · 0 projects" → expand →
Add project → picked "Project Test" → "Q1 · 1 project · Project Test ·
12 issues · Remove".

## Named deferred

- Active/Planned/All tab bar (needs initiative states authored).
- Initiative DETAIL page (description doc, health updates, targets).
- Initiative labels; project-page initiative picker (link currently
  lives on the initiatives page); health/update posts.

## Not measured

- Populated reference initiative rows (the test workspace had none —
  empty state + chrome captured; row anatomy for a POPULATED reference
  list still needs producing on Linear).
- Dark theme (shared tokens).
