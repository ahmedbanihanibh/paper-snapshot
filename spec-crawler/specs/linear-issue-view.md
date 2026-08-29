# Linear — issue view page (`/{ws}/issue/{id}/{title-slug}`) — PHASE 1/2 + BUILD RESULTS

## RESULTS (2026-08-24 — built + driven over CDP on localhost)

Rebuilt `components/dashboard/issue-detail-content.tsx` (docblock carries
the measured skeleton + named adaptations). Shipped and DRIVEN, each
verified live:

- Header: breadcrumb id · favorite star (role=switch, `CtxFavorite`
  extracted glyph, `--star-favorite` token) · Issue options ⋯ (shadcn
  DropdownMenu, shared MENU_CONTENT_BASE anatomy) · right cluster Copy
  URL/ID/branch + Work on issue (28×28 tooltip'd ghosts, extracted
  icons). NAMED ADAPTATION: reference's two header rows merged into our
  single 44px content header (our shell owns the app header).
- ⋯ menu (frame 044): Due date… ⇧D · Copy ▸ (ID ⌘. / URL ⌘⇧, / title
  ⌘⇧' / branch) · Favorite ⌥F · Remind me ▸ (ReminderPresetContent) ·
  Delete ⌘⌫. Submenu placement verified (x504 ≈ anchor.right). NAMED
  DEFERRED (no planes yet, same as ctx-menu spec): Add link/customer
  request/document, Create related ▸, Mark as ▸, Convert to ▸,
  description history, Filter… input.
- Rail: Status/Priority/Assignee (org members)/Agent pickers (28h rows,
  anchored 207 surface, `@tanstack/react-virtual`ized option lists),
  Labels § (9px-dot chips + Add labels toggle picker), Project §
  (Add to project via move plan). Driven: status→Todo→Backlog with
  activity entries; Bug label chip on/off; picker lists render.
- Activity: Subscribe/Unsubscribe flip (setSubscription plan;
  min-w reserved — no layout shift), timeline, composer.
- Sub-issues: children via parent_of relations render above the
  `+ Create new sub-issue` CTA (opens the REAL composer; relation
  attaches on server ack). Driven end to end: PB-17/PB-18 created,
  listed, row-click navigates to child.
- Delete: full forgiveness stack — plan snapshot, navigate-first +
  double-rAF, Undo toast, identifier-keyed no-flash guard.
- Every displayed chord bound and DRIVEN: ⌥F ⇧H ⇧D ⌘⌫ ⌘. ⌘⇧, ⌘⇧'.

**Drive-caught bug classes fixed (all permanent engine behavior):**
1. KeepAlive hidden-page chords — the issues list's window key handler
   fired while display:none (⌥F favorited the hidden cursor row PB-9
   from the issue view). Fix: `offsetParent === null` guard in the
   listener wrapper — applied to issues-content, drafts-content, and
   the new detail handler.
2. Stale-closure ack retry — relation attach after composer create
   re-ran a closure holding pre-create `items`, never finding the new
   row. Fix: `useLatestRef(buildReadContext)` + 8×400ms backoff, in both
   the detail page and issues-content's handleComposerCreated.
3. Delete-flash latch self-clear — a boolean isDeletingRef reset on
   `item` truthiness cleared itself in the render between navigate and
   the rAF-deferred plan apply. Fix: identifier-keyed guard
   (`deletedIdentifierRef`).
4. Reminder panel Esc — the NL input autofocuses so the window handler
   skips it; panel wrapper owns its own Esc (same as the list's ⇧H).
5. `deleteIssue`'s labelAssignments contract drifted from the real row
   shape (itemId vs subjectType/subjectId) — fixed at the seam.

**Not driven this pass:** Undo-toast click (same restoreIssue seam the
list's driven Undo uses; toast expired before the probe reached it);
dark-theme visual pass on this page (chrome is entirely shared tokens —
MENU_CONTENT_BASE + wi-surface — validated app-wide from frame 043);
Work-on-issue clipboard CONTENT (click + toast verified; payload is
deterministic string building cited to frame 045). Short-URL hard loads
still need Ahmed's `pnpm dev` restart for the rewrites.

---

# Original capture spec below

Started 2026-08-24. Reference: `linear.app/test-2-org-ahead/issue/TES-7/test`
(light; Ahmed's screenshot #209 + MCP `page_describe` inventory below).
Task #73 — ordered AHEAD of the board/dnd halves of #69. Ours has a
partial `IssueDetailContent` at `issue/:id` — AUDIT and extend it,
never fork.

## Control inventory (page_describe, main region, resting state)

Header row 1 (app header, h44):
- breadcrumb `TES-7 Test` (link, 78×20 @235,21)
- `Add to favorites` star (28×28, role=switch)
- `Issue options` ⋯ (28×28, aria-haspopup)

Header row 2 (content header, y61, right-aligned cluster):
- `Copy issue URL` 28×28 · `Copy issue ID` 28×28 · `Copy branch name`
  28×28 · UNLABELED dropdown 28×28 @1354 (capture its menu) ·
  `Work on issue` 28×28 @1383

Body column (x≈278–936):
- H1 title (`Test`)
- rich-text body (full tiptap doc: H2s, paragraphs, bullet lists in
  the screenshot)
- below body: `Add reaction` 28×28 + `Attach images, files, or videos`
  28×28 (y972)
- `+ Create new sub-issue` 126×24 (y1016)
- Activity header: `Unsubscribe from issue` 98×32 + `Change
  subscribers` 32×32 (y1085)
- activity entries: avatar link + author-name link + timestamp link
- comment composer: contenteditable 644×24 + `Attach` 24 + `Submit
  comment` 24 (y1182–1214)

Properties rail (x999, w≈425):
- `Properties` label · status `Backlog` 88×28 · `Set priority` 107×28 ·
  assignee `TD test dma` 92×28 + adjacent 32×28 LINK (s2262 — capture
  what it is; likely "view profile"?)
- `Labels` § · `Add labels` 96×28
- `Project` § · `Add to project` 126×28

Bottom agent dock: `Create Test issue details` suggestion · Agent ·
history (ours already ships the dock).

## State ledger (entry paths; fill from tiers 2–3)

| state | entry | captured? |
|---|---|---|
| resting, light | open TES-7 | ✓ describe + #209 |
| resting, dark | switch theme, reopen | TODO |
| every header overlay | click star/⋯/copy×3/dropdown/Work on issue | crawl_overlays running |
| every rail picker | click status/priority/assignee/labels/project | crawl_overlays running |
| set-value states | pick a value in each picker (label chip, project chip, priority icon) | TODO tier 3 |
| body edit | click into body, type, input rules | TODO (tiptap family — reuse doc-page captures) |
| reactions | Add reaction → picker → pill | TODO |
| sub-issue | Create new sub-issue → inline composer? | TODO |
| subscribe toggle | Unsubscribe → label flips | TODO |
| comment flows | type/submit/edit/react/resolve | partially = document comments family |
| activity feed shapes | property-change entries vs comments | TODO (produce changes, capture entries) |
| empty description | issue with no body | TODO (produce) |
| long title / overflow | produce | TODO |
| narrow viewport | resize | TODO |
| scroll behavior | header stickiness, rail stickiness | TODO |

## Captured (tier 2, frames 044–052 in spec-bundle/frames/)

- **044 Issue options ⋯** — a FILTERED command menu ("Filter…" input):
  Due date ⇧D · Add link… ^L · Add customer request… ^R · Add
  document… | Create related ▸ · Mark as ▸ · Copy ▸ · Convert to ▸ |
  Remove from favorites ⌥F · Remind me ⇧H · Show description history |
  Delete ⌘⌫. (Differs from the LIST ctx menu: no property rows — those
  live in the rail — and adds the Add-link/customer-request/document
  trio + description history.)
- **045 Work on issue** — copies an agent prompt: suggested branch
  `user/tes-7-title-slug` + `<issue identifier>` XML with title,
  markdown description (incl. `<linear-embed node-type="file">` JSON
  for uploads), `<team name>` (Ahmed pasted the exact payload —
  recorded verbatim in the task tracker #73).
- **046 Set priority** — palette: `Set priority to…` No priority /
  Urgent / High / Medium / Low.
- **047 assignee picker · 048 Add labels · 049 Add to project ·
  050 Create new sub-issue · 051 status picker** (`Change status…`
  Backlog/Todo/In Progress/Done/Canceled/Duplicate) · **052 Change
  subscribers** (`Change subscribers…` ⌘⇧S, Assignee group).

## Not measured (yet — the sweep is mid-flight)

- Add reaction picker (crawler saw no surface twice — portal-detection
  gap; drive it tier-3 and capture_state).
- NEVER click "Attach…" (native file dialog blocks the browser — Ahmed
  #214; deny-listed).
- Everything marked TODO above; the unlabeled 28×28 header dropdown's
  menu; the assignee-adjacent link target; px anatomy of rail rows
  (28h buttons measured by rect only); fonts/colors (extract frames,
  not eyeballs); the status-change clip-path animation (capture with
  capture_animation — feeds #69 too).
