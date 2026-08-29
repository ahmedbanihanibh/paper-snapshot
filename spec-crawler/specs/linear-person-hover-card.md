# Linear — person hover card (PHASE 1, capture incomplete)

Started 2026-08-24. No build exists and none may start until the card
is captured — this file records the entry-path hunt so the next session
doesn't repeat it.

## Entry paths TRIED, with results

| path | dwell | result |
|---|---|---|
| My-issues row assignee avatar (18px, x1299) | 3.2s sampled every 500ms | no `[role=dialog]`/`[role=tooltip]` appeared |
| Members page rows | prior session | recorded blocker: "card doesn't open from the members page" |
| Document comment author avatars | — | no `<img>` avatars found on the doc (initials divs; hover untested on them — RETRY here) |
| Document @mention chip | — | mention insertion failed (the `@` menu did not open; editor focus not confirmed — instrument issue, not a finding) |
| Issue detail assignee row | — | UNBLOCKED via spec-crawler MCP attach (raw-CDP tabs still wedge on /issue/*; close wedged tabs via `/json/close/<id>` first) |
| Issue detail: activity author NAME `<a>` | MCP hover + real pointer, 4s sampled | no dialog/tooltip |
| Issue detail: Assignee properties button | real pointer, 4s sampled | no dialog/tooltip |

## Facts so far

- SIX entry paths tried without producing the card. The remaining
  honest hypotheses: (a) the card anchors somewhere untried (comment
  header avatar inside a REAL issue comment thread; members page NAME
  text with tooltip-grade dwell), or (b) the prior-session screenshot
  that motivated this task was a Paper design frame, not live Linear —
  verify WHICH before any further hunting.
- The profile PAGE (`/profiles/{username}`) is captured and built — the
  card links there when it lands.

## Next action (named)

Attach via `spec-crawler` MCP `browser_attach {navigateTo: issue url}`
(its session survived issue pages before), `page_describe`, then
`hover` the assignee control and the activity-feed author names with
the MCP `hover` primitive (real pointer + JS hover) and 1–3s dwell.
If still nothing: hover the NAME text, not the avatar; then a comment
author name in an issue thread.

## Not measured

Everything about the card itself — anatomy, dwell delay, contents,
placement, both themes. NO BUILD until this section shrinks.
