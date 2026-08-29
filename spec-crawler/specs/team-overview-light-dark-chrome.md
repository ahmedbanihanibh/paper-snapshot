# Team overview — page chrome, BOTH themes (measured live)

**Entry path.** Attach to the Linear tab (`linear.app/test-workspace-bb/team/EMP/overview`).
Theme is **not** switchable by flipping the `html` class — Linear writes its
palette as inline custom properties on `<html>` from JS, so the class does
nothing. Switch through the app: `⌘K` → type `theme` → click the row whose
text is exactly `Change interface themeLight` (or `…Dark`). **Do not press
Escape afterwards** — that palette previews the theme live and Escape cancels
the preview, silently restoring the old theme. Clicking the row commits it.

Values below were read through the page's own canvas (`fillStyle` →
`getImageData`), never sampled by eye.

## Ground

| Surface | Light | Dark |
|---|---|---|
| app background (`--bg-color`, `--bg-sidebar-color`) | `#EFEFF0` | `#09090A` |
| content frame fill (`--bg-base-color`) | `#F9F9FA` | `#121213` |
| content frame border | `0.5px #E2E2E2` | `0.5px #212224` |
| content frame radius | `12px` | `12px` |
| content frame shadow | `lch(0 0 0/.02) 0 3px 6px -2px, lch(0 0 0/.04) 0 1px 1px 0` | `lch(0 0 0/.3) 0 .5px 1px 1px` |
| section divider | `#E2E2E2` | — |

The frame's elevation is **not** one theme-independent shadow: light is two
soft stops, dark is a single tight one. Express both in `rgb()` — Lightning
CSS silently drops `lch()` custom properties.

## Tab pills (Overview / Documents / Members)

Both states are FILLED pills, `28h`, `radius 9999px`, `padding 0 10px`,
`12px/500`. The selected one is *darker* in light and *lighter* in dark — the
relationship inverts, so do not derive one from the other.

| | Light | Dark |
|---|---|---|
| selected bg / label | `#ECECED` / `#1B1B1B` | `#29292B` / foreground |
| rest bg / label | `#FFFFFF` / `#5C5C5E` | `#1C1C1D` / `#959597` |

## Round actions (☆, ⋯, Copy team URL, Add resources, Add section)

`28×28`, `radius 9999px`, `padding 0 2px`, no border, no shadow.

| | Light | Dark |
|---|---|---|
| glyph | `#2F2F31` | `#E3E4E6` |
| ghost rest bg | transparent | transparent |
| filled rest bg (Add resources / Add section / Create new issue) | `#FFFFFF` | `#1B1C1D` |
| favorited ☆ | `#F0BF00` | `#F0BF00` |

The glyph colour is **one step below the title, not muted** — this is the
single biggest tell when it is wrong, because muted glyphs make the whole
header read washed-out. In our app that value already exists as
`--secondary-foreground` (`#303032` / `#E3E4E7`, within one unit of the
measurement) — use `text-secondary-foreground`, do not mint a token.

## Text

| | Light |
|---|---|
| team title | `#1B1B1B`, `24px/500` |
| rail heading | `#5C5C5E` |
| muted label (rest pill, headings) | `#5C5C5E` |

## Not measured

- Hover / focus / active washes for the round actions and the tab pills in
  either theme (`capture_css_spec` has not been run on this surface). Our
  build currently uses the house `foreground/10` wash.
- The Documents and Members tab surfaces themselves — only the pills that
  route to them.
- Light-mode menu/dropdown chrome beyond `--menu-bg #FFFFFF`,
  `--menu-highlight #F1F1F1`, `--menu-border #E8E8E8` (captured earlier, from
  the menu itself — note this is a *different* value from the `#E2E2E2` frame
  border, so the two must not be aliased).
- Drag-reorder affordances on resource rows.
- The team-appearance picker in light mode.
