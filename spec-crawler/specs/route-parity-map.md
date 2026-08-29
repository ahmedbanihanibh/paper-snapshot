# Route parity — drop `/dashboard` from in-app paths (#68, PHASE 1)

Written 2026-08-24. NO CODE until this map is approved — every URL a
user has bookmarked changes shape, which is exactly the kind of cut the
build-contract gate exists for.

## Reference paths (observed live this session, not assumed)

| Linear URL | seen at |
|---|---|
| `/{ws}/inbox` | test-workspace-bb |
| `/{ws}/my-issues/assigned` | test-2-org-ahead |
| `/{ws}/issue/TES-68/{title-slug}` | test-workspace-bb (slug AFTER the id) |
| `/{ws}/document/{slug}-{hex}` | test-workspace-bb |
| `/{ws}/profiles/{username}` | test-48bd-dd25 |
| `/{ws}/settings/…` | prior session captures |

## The map (old → new), every current subPath

| ours today (`/{org}/dashboard…`) | new (`/{org}…`) | Linear-parity notes |
|---|---|---|
| `/dashboard` | `/` → project list | Linear's root is the default team view; ours stays the project list (named divergence — our home surface) |
| `/dashboard/issues` (+ `/issues/assigned` etc.) | `/my-issues/assigned` … | ALIAS: keep `/issues/*` working; canonical becomes `my-issues/*` per reference |
| `/dashboard/issues/:id` | `/issue/:identifier/:title-slug?` | reference is SINGULAR `issue/` + optional slug after id |
| `/dashboard/inbox` | `/inbox` | 1:1 |
| `/dashboard/documents` (+ `/:id`) | `/documents`, `/document/:docId` | list plural, detail singular — matches reference |
| `/dashboard/document/:docId` | `/document/:docId` | already reference-shaped, just de-prefixed |
| `/dashboard/profiles/:slug` | `/profiles/:slug` | 1:1 |
| `/dashboard/agent`, `/agent/:slug` | `/agent…` | no reference equivalent (our surface) — de-prefix only |
| `/dashboard/drafts` | `/drafts` | Linear: drafts live in the composer; ours is a page (named divergence) |
| `/dashboard/settings`, `/settings/preferences` | `/settings/…` | reference shape |
| `/dashboard/team` | `/settings/members`? | reference puts members under settings — DECIDE: move or keep `/team` (recommend keep `/team` now, revisit with settings redesign) |
| `/dashboard/{templates,protocols,usage,activity,billing,billing/plans,audit,integrations,integrations/cli,api-keys,import,documentation,firmware,overview,overview/*,system,admin/*}` | same, de-prefixed | our-product surfaces, no reference equivalent — mechanical de-prefix |

## Mechanism (designed earlier, unchanged)

1. `next.config.mjs`: add short-path rewrites `/:orgSlug/:path+` →
   app-shell already EXISTS via the bare `/:orgSlug` + `/p/:path+` +
   `/templates` patterns — extend with one `/:orgSlug/:sub(inbox|my-issues|issues|issue|documents|document|profiles|agent|drafts|settings|team|…)/:path*` rewrite so short URLs land in the shell (explicit allowlist, NOT a
   catch-all, to avoid shadowing `/pricing`-class top-level routes).
2. `getDashboardSubPath` accepts BOTH shapes (`/{org}/dashboard/X` and
   `/{org}/X`) — one function, one truth.
3. `DynamicRoutes` matches with `<Routes location>` on the normalized
   subPath so route defs stay prefix-free.
4. ONE canonicalizer helper (`lib/workspace-nav.ts` is the seam) used by
   `useDashboardNavigate` + `switch-cache-page` so every emitted URL is
   short-form.
5. `CacheDisplayManager` `history.replaceState`s legacy → short on
   arrival (bookmarks keep working, address bar shows the new shape).
6. Aliases: `issues/*` ⇄ `my-issues/*`, `issues/:id` ⇄ `issue/:id`.
7. Contract test: every `STATIC_CACHE_KEYS` entry resolves identically
   through both shapes; every emitted nav URL is short-form.

## Open decisions (need approval)

- `/team` vs `/settings/members` (recommend: keep `/team` this pass).
- Does `/{org}/` root show the project list or redirect to
  `/my-issues/assigned`? (recommend: project list — our home.)
- Issue detail: adopt the `:title-slug` suffix after the identifier now,
  or id-only? (recommend: id-only this pass; slug is cosmetic.)

## Not measured

- Linear's team-scoped paths (`/team/{key}/…`) — we have no team-key
  routing; capture before any team-scoped surface adopts URLs.
- Linear's `/views`, `/projects` top-level paths.
- What Linear does with a stale/legacy URL shape (no legacy shape exists
  there to observe; our replaceState policy is a house decision).

## RESULTS (2026-08-24 — SHIPPED)

Mechanism as built (differs from the sketch in ONE place — normalization
direction):

- `lib/workspace-nav.ts` owns the pair: `shortenWorkspacePath` (internal
  → Linear-short) and `workspaceSubFromPathname` (BOTH shapes → the one
  internal sub-path), plus `WORKSPACE_SHORT_SEGMENTS`.
- The router's INTERNAL location stays dashboard-shape everywhere: the
  chrome's `*` gate (`WorkspaceShortGate`, app-router.tsx) catches short
  URLs and `Navigate replace`s them to the internal shape — so every
  pathname consumer (sidebar active rows, issue-tab parser, cache keys,
  dynamic patterns) is untouched. The ADDRESS BAR is canonicalized to
  the short shape after each router commit (CacheDisplayManager; one
  450ms confirm pass because Next hydration re-asserts the request URL
  once — measured) and by the hover-nav `scheduleUrlReplace`.
- Bare `/{org}` = home (project list). `my-issues/*` ⇄ `issues/*`
  (bare → assigned), `issue/:id` ⇄ `issues/:id`.
- Server rewrites: explicit `:seg(...)` allowlist in next.config.mjs
  (NOT a catch-all); contract test keeps it in lockstep with the
  client set AND with STATIC_CACHE_KEYS first-segments.

Driven 9/9 (spec-bundle scratch x54): legacy URL → short bar · sidebar
nav → short · short /my-issues/created renders with the Created tab
ACTIVE (0.13 wash vs 0.07 — the first drive caught the tab parser
missing short shapes; fixed by the gate normalization) · row click →
/issue/PB-9 · direct short detail renders · bare org renders home ·
hover-nav short. Tests: 70 pass incl. lib/__tests__/route-parity.test.ts.

DECIDED (per Ahmed's blanket approval): keep `/team` this pass; root =
project list; `issue/:id` without title slug.

## Not measured / named

- HARD LOADS of short URLs need the new next.config rewrites — live
  after the next `pnpm dev` restart (client-side entries already work).
- Sidebar anchor hover-previews still SHOW the internal /dashboard href
  (bar canonicalizes on click) — cosmetic; revisit if Ahmed wants
  short hrefs in the anchors themselves.
- Linear's `:title-slug` suffix on issue urls — deferred by decision.
