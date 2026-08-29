# Linear — link editor (document selection toolbar)

Captured 2026-08-24 from `linear.app/test-workspace-bb/document/ddee-1daad9c37a3f`,
light theme, Edge @ 9222.

**Entry paths** — with text selected, either click the selection toolbar's
`Link` button (`aria-label="Link"`) **or press ⌘K**. Both were driven.

> An earlier pass in this session recorded "⌘K does not open it — the palette
> owns that chord". That was **wrong**, and instructively so: the chord was
> being sent through `dump-tree.mjs`'s `key(k, code, vk)`, which has no
> modifier parameter, so the browser received a bare `k`. The absence-probe
> class with a keyboard instead of a selector. `spec-bundle/drive.mjs::press`
> now takes modifiers, and re-driving it opened the field immediately.

## The structural finding

It is **not a popover**. The selection toolbar *becomes* the link editor: same
anchor, same y, the bar's whole control row is replaced by a field + two icon
buttons and the box shrinks to 222px. Centring is unchanged (`mid − w/2`),
which is why the measured x (355) lands on the same selection midpoint the
15-control bar used.

## Measured

| Node | Value |
|---|---|
| container | `222×37` · `radius 8` · `background lch(100 0 282)` (`--menu-bg`) · `border 0.5px lch(86.5 0 282)` · `padding 0` |
| shadow | `lch(0 0 0/.02) 0 3px 6px -2px, lch(0 0 0/.04) 0 1px 1px 0` |
| inner row | `flex` · `align-items: center` · `padding: 4px` (fills the 221×36 border box) |
| input | `161×28` · `padding 6px 12px` · `margin-right 4px` · `12px / 400` · colour `lch(20 1 282)` (`--secondary-foreground`) · transparent · **no border** · placeholder `Enter link URL` · autofocused (`document.activeElement` is the field) |
| button ×2 | `14×14` · `radius 2` · `margin 0 5px` · transparent background · `cursor: pointer` |
| glyph | `viewBox 0 0 16 16` rendered at 14 · `fill lch(40 1 282)` (`--muted-foreground`) → **`lch(20 1 282)` on hover**; the button background stays transparent — there is no hover wash |

Width adds up exactly: `4 + 161 + 4 + (5+14+5) + (5+14+5) + 4 = 221`.

## TWO shapes — the control set depends on the selection

The first pass captured only a plain-text selection and reported "two
buttons". That was one state of two, and it is the failure the control
inventory exists to prevent.

| Selection | Box | Controls (DOM order, left→right) | Field |
|---|---|---|---|
| plain text | **222 × 37** | `Show embed` · `Remove link` | empty |
| already a link | **246 × 37** | **`Open`** · `Show embed` · `Remove link` | pre-filled with the href |

`246 − 222 = 24` — one 14px control plus its `0 5px` margins.

**`Open` is an `<a href>`, not a button** (`tag: "A"`, and on a Linear URL
the href is internalised to a relative path, `/test-workspace-bb`). Its
`border-radius` is **0**, where the two buttons are **2**. Its glyph is the
"open external" path, extracted in full into
`components/rich-text/selection-toolbar.tsx::OpenGlyph`.

### Hovering a link produces NO surface

Two differently-shaped probes agree — the `document.body` child-count
signature is unchanged, and a text search for the href anywhere outside
the editor finds nothing. The anchor's `cursor` is `text`, not `pointer`,
which is consistent: there is no hover affordance on a link at all, you
go through the toolbar. Anchor style: `color lch(44.073 70 286.91)`,
`text-decoration: underline 1px` in the same colour.

### The two buttons (title attributes, extracted paths)

1. **`Show embed`** — three rects, all `x=1 width=14`:
   `y=1 h=1.5 rx=.75`, `y=4 h=8 rx=1`, `y=13.5 h=1.5 rx=.75`.
2. **`Remove link`** — the trash glyph; identical `d` to the `Delete` row in the
   comment ⋯ menu (`components/documents/comment-menu-glyphs.tsx::DeleteGlyph`).

There is **no submit button**. Enter commits.

## Driven behaviour

| Action | Result (observed) |
|---|---|
| `Escape` | field gone, the **selection toolbar returns** in its place, the text selection survives |
| `Enter` with a URL typed | field gone, the mark is applied (`<a href="https://example.com/abc">`), selection collapses, no toolbar |
| open → hover a glyph | fill darkens `lch(40…)` → `lch(20…)`; background stays transparent |

## Not measured

- Dark theme of this exact surface (the container/field/glyph roles all map to
  tokens already measured in both themes, but the field's own colours were not
  re-read in dark).
- ~~What `Show embed` produces.~~ **ANSWERED** — see
  `specs/linear-link-embed.md`. The earlier "no observable change" was a
  **wrong precondition**: the link has to be ALONE on its own paragraph. With
  that, the click swaps the paragraph for an 805×101 `contenteditable=false`
  embed card, which carries a hover toolbar of its own.
- Focus ring / invalid-URL handling on the field.
- The pressed/active state of the three controls.
- Middle-click and ⌘-click on `Open` (inferred to work from it being an
  anchor; not driven).
