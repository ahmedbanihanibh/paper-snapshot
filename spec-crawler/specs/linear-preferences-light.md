# Linear Preferences (light) — live parse

Date: 2026-08-21  
URL: https://linear.app/test-workspace-bb/settings/account/preferences  
Viewport: **1432×723**  
Bundle: `spec-crawler/spec-linear-preferences`  
Paper (Open grove): **C2F-0** rest, **CLT-0** Default home view select open

## Shell (measured)

| Piece | Rect |
|---|---|
| Back to app | 112×28 at (16, 16) |
| Search settings | 220×28 at (12, 57) |
| Settings nav rows | 220×28, x=12, pitch 29px (Preferences y=135, Profile y=164, …) |
| Scene combobox (Reviews) | 90×30 at (1048, 193) |
| Home-view listbox (open) | 182×621 at (1046, 92), portalled |
| Agent dock chips | y=691, 28px, scene column |
| Agent | 77×28 at (1315, 691) |
| Chat history | 28×28 at (1394, 691) |

Settings rail uses the same **220×28 / 8px wash / 12px inset** row as the app sidebar. The white rounded **scene** is SceneSettings: page title left, **label + hint left / control right** rows, section headers above the card (General, Interface and theme). Comboboxes are 30px-tall pills, not Vercel fieldset cards.

## States captured

- Rest (light)
- Default home view `select` open — Radix listbox, `data-state=open`

## Not measured

- Dark theme of Preferences
- Hover wash on settings rows (CSS scan exists in bundle; not force_state sampled)
- Customize sidebar dialog
- Full overlay crawl (limit 8 navigated away via Notifications / Code & reviews)
- Keyboard `G then S` from the workspace menu into this page
