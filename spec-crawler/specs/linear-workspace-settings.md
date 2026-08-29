# Linear — settings suite (G-then-S, `/settings/*`) — capture + build

Captured 2026-08-24 on `linear.app/test-2-org-ahead/settings` (light).
Frames: 065 (shell + Preferences, full text inventory), 066 (Profile),
067 (Issue labels), plus a page_describe of /settings/workspace.
Task #75.

## Measured shell

- `/settings` redirects to `/settings/account/preferences`.
- Rail: Back to app 112×28 @16,16 · Search… 196×28 @12,57 · sections
  with 196×28 rows @x12: **Personal** (Preferences / Profile /
  Notifications / Code & reviews / Security & access / Connected
  accounts / Agent personalization) · **Issues** (Labels / Templates /
  SLAs) · **Projects** (Labels / Templates / Statuses / Updates) ·
  **Features** (AI & Agents / Initiatives / Documents / Customer
  requests / Releases / Pulse / Asks / Emojis / Integrations) ·
  **Administration** (Workspace / Teams / Members / Security / API /
  Applications / Billing / Usage & limits / Import & export) ·
  **Your teams** (workspace team / Create a team).
- Preferences rows (full text in frame 065): Default home view ·
  Display names · First day of the week · Convert text emoticons ·
  Send comments on… · App sidebar Customize · Font size · Use pointer
  cursors · Underline links · Disable animated images & emoji ·
  Interface theme (• Aa Light) · Open in desktop app · Auto-assign to
  self · On-move-to-started assign.
- Profile (frame 066): Profile picture tile · Email (read) · Full name ·
  Title · Username.
- Issue labels (frame 067): header + Workspace scope + [New group]
  [New label]; table Name / Description / Issues / Last applied /
  Created; rows with color dot + inline "Add label description…".
- Workspace page: logo tile 34×34 · name input · URL input · fiscal
  year start (January) · 2× Available-on-Enterprise rows · Delete
  workspace.

## RESULTS (2026-08-24 — built + driven on localhost)

`components/dashboard/settings/` (one directory per seam):
`settings-nav.ts` (registry — the docblock NAMES every omitted
reference row), `settings-rail.tsx` (Back to app + search filter +
sections), `settings-surface.tsx` (ONE KeepAlive cache page for every
`/settings/*` sub-path; Linear-shaped routes
`/settings/account/preferences|profile`, `/settings/issue-labels`,
`/settings/workspace`), `labels-settings.tsx` (real workLabels CRUD).
`SettingsContent` gained a `section` prop so Profile and Workspace are
one implementation split across two rail rows.

Driven over CDP: rail renders with all shipped sections; Labels page
create (QA) → row appears with color dot/count/date → hover-reveal
Delete → row removed with Undo toast; Profile shows account fieldsets
only; Workspace shows org fieldsets only; Back to app returns to the
dashboard; short URLs canonicalize (`/settings/issue-labels`).
Preferences gained the measured Interface-theme row (System/Light/Dark
via next-themes + shadcn Select).

## Named deferred / divergences

- Rail rows with no plane behind them are OMITTED (dead-affordance
  rule), not disabled: Notifications, Code & reviews, Security &
  access, Connected accounts, Agent personalization, Templates, SLAs,
  the Projects + Features blocks, Teams, Security, Applications,
  Usage & limits.
- Members / Billing / API / Import & export rail rows navigate to the
  existing full pages outside the settings surface until those migrate
  in.
- Preferences rows without engine backing are not rendered: default
  home view, display names, first day of week, emoticons, send-on key,
  sidebar customize, font size, animated-image kill, desktop app,
  auto-assign pair.
- Content anatomy stays our Vercel-fieldset settings style this pass;
  the Linear row-anatomy restyle of page CONTENT is follow-up work.
- Label "New group" + "Last applied" column gated (no groups /
  last-applied tracking on the plane).

## Not measured

- Dark theme of the settings shell (chrome = shared tokens).
- The settings Search's content-matching behaviour (ours filters row
  labels only).
- Notifications / Security & access / Connected accounts page bodies.
- The Statuses / Templates / SLAs page bodies.
