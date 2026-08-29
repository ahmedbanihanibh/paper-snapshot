# Linear TES/all + workspace menu (light) — live parse

Date: 2026-08-21  
URLs: `…/team/TES/all` (issues), workspace menu from My Workspace  
Viewport: **1432×723**  
Bundle: `spec-crawler/spec-linear-issues-light`  
Paper: **9HJ-0** list rest, **ARZ-0** workspace menu open

User screenshot 1 is this menu over the grouped issues list (Settings, Invite, Download desktop app, Switch workspace, Log out) plus the Coding sessions promo card.

## Issues list (same geometry as prior dark capture)

| Piece | Measure |
|---|---|
| Workspace switcher | 142×28 at (12, 16) |
| Search / create | 28×28 at x=172 / 204, y=16 |
| Nav rows | 220×28, x=12, pitch 29px |
| Scene issue rows | 1179×44 at x=245 |
| View tabs | Active (253, 60) 57×28; Backlog (314, 60); All issues (385, 60) |
| Groups | In Progress 4, Todo 7, Backlog 18, Done 27 — collapse + count + + |

Light vs prior dark 1XI-0: **same structure**, theme tokens inverted. Do not treat light as a different layout.

## Workspace menu (002)

| | |
|---|---|
| Trigger | My Workspace, 142×28 at (12, 16) |
| Surface | dialog + inner listbox, **225×197 at (12, 48)** |
| Gap | 4px below trigger (48 − 16 − 28) |
| Items | Settings (`G then S`), Invite and manage members, Download desktop app, Switch workspace (`O then W`), Log out |
| Portalled | false (in-tree) |

## Dashboard mapping (when implementing)

| Linear | Protocolbase |
|---|---|
| Grouped 44px issue rows | Overview / Protocols list (not Vercel project cards) |
| View tabs Active / Backlog / All | Active / Archived / All |
| Workspace menu | Org switcher: Settings, Team, Integrations, Log out — linear dropdown, `animate-none` |
| Preferences scene | Org Settings → SceneSettings + settings-row primitive |
| Agent dock | Ask Protocolbase chips, scene column only |

## Not measured

- Hover/selected matrix on light issue rows (reuse `issues-list-surface.md` attribute model)
- Workspace submenu “Switch workspace ▶”
- Light-theme token values (need `capture_css_spec` on TES/all; Preferences scan is in the other bundle)
