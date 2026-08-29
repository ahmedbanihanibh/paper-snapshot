# Protocolbase dashboard — Linear workspace (Paper-only)

Date: 2026-08-21  
Paper: https://app.paper.design/file/01M0JG34H5ZKFDPTV1J120YDXQ/1-0  
Source of truth chrome: **1XI-0** (`019-composer-collapsed-750`) 1432×723  
Proposal (labels remapped, pixels cloned): **508-0** `PB dashboard · Linear workspace (from 1XI-0)`  
Legend: **5FF-0** `PB · Linear primitives map`

**No application code was changed for this pass.**

## Why the live app is not 1XI-0

1XI-0 is Linear’s **workspace shell**: 244px nav, inset **scene** (rounded panel, 8px top), **agent dock on the scene column only**, 28×220px rows, 8px radius wash, composer chips. The dashboard still uses Vercel sidebar/header primitives (or a structural approximation of Linear). Matching Linear means adopting Linear primitives, not wrapping Linear lists in Vercel chrome.

## Measured chrome (live Linear TES/all, same viewport)

- Nav: 244×723 at (0,0)
- Scene: ~1180×679 at (244, 8)
- Nav rows: 220×28, x=12, radius 8px, 12px inset, pitch 29px
- Issue rows (list scenes): 1179×44 at x=245
- Dock chips: y=691, 28px, scene column only
- Hover wash: same frame; **no background-color transition**

## IA remap on 508-0

| Linear slot | Protocolbase |
|---|---|
| Workspace switcher | Protocolbase |
| My issues | Overview |
| Inbox | Inbox |
| Reviews | Issues |
| Agent | Agent |
| Drafts | Templates |
| Workspace section | Library |
| Your teams | Workspaces |
| Team Home | Overview (selected) |
| Cycles / Current / Upcoming | Versions / Active / Drafts |
| Views | Documents |
| Scene tabs | Overview / Protocols / Team |
| Go to | Integrations, Settings, Issues, Versions, Projects, Templates |
| Dock | prompt chips + Agent + history |

## Code target (when implementing — not this session)

From `Linear-primitives.md`: SceneSettings for scene body; 28px wash rows not Vercel Sidebar; VirtualCardList + ClickableSettingsCardRow for lists; LinearEmptyRow; linear/dialog + linear/dropdown-menu; PbField/PbInput `px-2` `rounded-[8px]`; radii {8,12,16,full}.

From `React-rerender-primitives.md`: StaticLink on nav rows; `everOpened` on Agent/search/history hosts; overlay roots mount-on-intent; KeepAlive + only CacheDisplayManager on `useLocation`.

## Not measured

- Light theme of 1XI-0 (dark capture only)
- Hover/selected matrix on the remapped clone (clone is rest state)
- Issues-list scene (TES/all) as a second Protocolbase artboard — 1XI-0 is team Home + composer, not the issue table
- Icon extraction per row (icons are Linear captures; do not redraw)
