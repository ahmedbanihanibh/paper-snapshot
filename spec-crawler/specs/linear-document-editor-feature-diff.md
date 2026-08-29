# Linear document editor — edge-to-edge feature diff vs our clone

Measured live over CDP against two tabs, 2026-08-23:

- **Reference** — `https://linear.app/test-workspace-bb/document/ddee-1daad9c37a3f`
  (test workspace; the doc body was emptied and re-populated repeatedly to reach states).
- **Ours** — `http://localhost:3000/personal-js78wygs4g9f4f2d6ytbxk4a1h84anm2/dashboard/document/test-ahmed-banihani-sahdjhashjdajshjhadsjhas-2890bf5c-…`
  (existing content preserved; every probe was appended after the trailing
  `Thank you` paragraph and rolled back with ⌘Z until a tag-list+length signature
  matched the pre-probe baseline).

Dark theme, viewport 1432 × 723, raw CDP (`spec-bundle/dump-tree.mjs`).

Linear body editor is `document.querySelectorAll('.ProseMirror')[1]`
(`aria-label="Document content"`); `[0]` is the title (`aria-label="Document title"`).
Ours is a single `div.tiptap.ProseMirror`; the title is a separate `<textarea>`.

---

## 0 · Task A — the task-list drag grip (exact capture)

**Entry path:** empty body → type `[] first task` ⏎ `second task` ⏎ `third task`
→ hover a `li[data-type="todo_item"]`.

### 0.1 Markup

```html
<li data-type="todo_item" data-done="false">
  <div class="todo-checkbox-container">
    <svg width="6" height="10" viewBox="0 0 6 10" class="todo-drag-handle">
      <path fill-rule="evenodd" clip-rule="evenodd" d="…"/>
    </svg>
    <div class="todo-checkbox todo-checkbox-unchecked" contenteditable="false"
         role="checkbox" aria-checked="false" tabindex="0"
         aria-labelledby="todo-item-content-64"></div>
  </div>
  <div class="todo-content" id="todo-item-content-64"> … </div>
</li>
```

### 0.2 The complete path `d` (verbatim, untruncated)

```
M1 8C1.55228 8 2 8.44772 2 9C2 9.55228 1.55228 10 1 10C0.447715 10 0 9.55228 0 9C0 8.44772 0.447715 8 1 8ZM5 8C5.55228 8 6 8.44772 6 9C6 9.55228 5.55228 10 5 10C4.44772 10 4 9.55228 4 9C4 8.44772 4.44772 8 5 8ZM1 4C1.55228 4 2 4.44772 2 5C2 5.55228 1.55228 6 1 6C0.447715 6 0 5.55228 0 5C0 4.44772 0.447715 4 1 4ZM5 4C5.55228 4 6 4.44772 6 5C6 5.55228 5.55228 6 5 6C4.44772 6 4 5.55228 4 5C4 4.44772 4.44772 4 5 4ZM1 0C1.55228 0 2 0.447715 2 1C2 1.55228 1.55228 2 1 2C0.447715 2 0 1.55228 0 1C0 0.447715 0.447715 0 1 0ZM5 0C5.55228 0 6 0.447715 6 1C6 1.55228 5.55228 2 5 2C4.44772 2 4 1.55228 4 1C4 0.447715 4.44772 0 5 0Z
```

Six dots (2 columns × 3 rows), r = 1, at (1,1) (5,1) (1,5) (5,5) (1,9) (5,9)
inside a 6 × 10 viewBox. `fill-rule="evenodd" clip-rule="evenodd"`.

### 0.3 Fill colours (measured, `CSS.getMatchedStylesForNode` + forced `:hover`)

| state | rule | token | resolved |
|---|---|---|---|
| rest | `.editor .todo-drag-handle { fill: var(--editor-label-faint) }` | `lch(36.975% 1.2 272 / 1)` | `rgb(86, 87, 89)` |
| hover (on the grip itself) | `.editor .todo-drag-handle:hover { fill: var(--editor-label-muted) }` | `lch(61.803% 1.2 272 / 1)` | `rgb(149, 149, 151)` |

Visibility is a separate axis from colour:

```css
.editor .todo-drag-handle { opacity: 0 }
.editor li[data-type="todo_item"]:hover:not(:has(li:hover)) >
  .todo-checkbox-container > .todo-drag-handle { opacity: 1 }
```

`:not(:has(li:hover))` means a parent item does **not** show its grip while the
pointer is over one of its nested children — only the innermost hovered item does.
No transition is declared on the handle (`transition: all` computed = the UA
default, 0s); the sibling checkbox does declare
`transition: background-color 80ms ease-out, border-color 80ms ease-out`.

### 0.4 Hit box (the SVG *is* the hit target — there is no wrapper button)

Full rule:

```css
.editor .todo-drag-handle {
  opacity: 0; cursor: move;
  width: 14px; height: 100%;
  fill: var(--editor-label-faint);
  user-select: none;
  padding-left: 2px; padding-right: 6px;
  position: absolute; left: -12px;
}
```

| element | box (w × h) | position | notes |
|---|---|---|---|
| `li[data-type="todo_item"]` | 781 × 24 | `position: relative` | line-height 24px |
| `.todo-checkbox-container` | 14 × 24 | `absolute; left: calc(-1 * var(--editor-list-inset))` = **−24px**, `display:flex; align-items:center; height:1lh` | |
| `svg.todo-drag-handle` | **14 × 24** | `absolute; left: −12px` (relative to the container) | radius 0, background none, `cursor: move` |
| `path` (painted glyph) | 6 × 10 | centred in the svg's content box | |
| `.todo-checkbox` | 14 × 14 | static, first flex child of container | radius **3px**, 1px border `var(--editor-label-faint)`, padding 2px |

Absolute x positions at viewport 1432 (`li` text edge x = 443.5):

- checkbox container / checkbox: x = **419.5** → 24px left of the text edge
- svg hit box: x = **407.5** → 36px left of the text edge, 12px left of the checkbox
- painted 6px glyph: x = **409.5** → **34px left of the text edge, 10px left of the checkbox**

Height is `100%` of the line box, so the grip is a 14 × 24 column — comfortably
grabbable even though only 6 × 10 is painted. No border-radius, no hover
background wash: the *only* hover feedback is the fill change plus opacity 0→1.

### 0.5 Drag semantics (driven with real CDP mouse events; HTML5 DnD confirmed by
event trace `pointerdown → mousedown → dragstart → dragover×N → drop → dragend`)

- **Vertical drag reorders.** Dragging item 1's grip down past item 2 produced
  order `second / first / third`. Verified twice.
- **Sideways drag does NOT indent or outdent.** Dragging a nested item's grip
  80px to the left, and dragging a top-level item 120px to the right, both left
  the tree byte-identical (depth unchanged, order unchanged). Horizontal offset
  is ignored; the drop position is ProseMirror's `posAtCoords`.
- **Depth still changes — but only via the drop *position*, never the x offset.**
  Dragging a top-level item straight down onto a row that lives inside a nested
  sublist re-parented it (depth 1 → depth 2) with zero horizontal movement.
  So "you can change nesting by dragging" is true; "you can change nesting by
  dragging sideways" is false.
- Nesting itself is `Tab` / `Shift-Tab`. The nested `ul[data-type="todo_list"]`
  is a child of `.todo-content`, **not** a direct child of the `li`.

*Guard note:* "the item moved" was not accepted as proof of reorder — the tree
walker emits depth per item, and the sideways tests were re-run against a
known-good vertical drag in the same session to prove the harness could still
produce a change.

### 0.6 Ours

**No drag grip exists at all.** Our task item is:

```html
<ul data-type="taskList">
  <li data-checked="false">
    <label contenteditable="false">
      <input aria-label="Task item checkbox for one" type="checkbox">   <!-- 1×1 -->
      <span>Task item checkbox for one</span>                            <!-- 1×1 -->
    </label>
    <div><p>one</p></div>
  </li>
```

- `label` 14 × 14 at x = 294; content `div` at x = 316 → **22px** gutter
  (Linear: 24px).
- Nothing appears in the left gutter on hover — verified by hovering the row and
  re-dumping the subtree (identical, `[aria-label]` sweep inside the editor returns `[]`).
- Reordering a task item by mouse is therefore impossible; only ⌘Z/typing.
- Checkbox is a real `<input type=checkbox>` behind a `<label>`; Linear uses a
  `div[role="checkbox"][aria-checked]`.

---

## 1 · Slash menu

### 1.1 Linear — 13 visible rows + 3 search-only

Entry: caret on an empty paragraph → `/`.

| # | label | group | icon | hint |
|---|---|---|---|---|
| 1 | Heading 1 | headings | ✔ 16×16 | ⌘⌥1 |
| 2 | Heading 2 | headings | ✔ | ⌘⌥2 |
| 3 | Heading 3 | headings | ✔ | ⌘⌥3 |
| — | *separator (11px block, 1px hairline)* | | | |
| 4 | Bulleted list | lists | ✔ | ⌘⇧8 |
| 5 | Numbered list | lists | ✔ | ⌘⇧9 |
| 6 | Checklist | lists | ✔ | ⌘⇧7 |
| — | *separator* | | | |
| 7 | Insert media… | media | ✔ | — |
| 8 | Insert gif… | media | ✔ | — |
| 9 | Attach files… | media | ✔ | ⌘⇧U |
| — | *separator* | | | |
| 10 | Code block | blocks | ✔ | ⌘⇧\ |
| 11 | Diagram | blocks | ✔ | — |
| 12 | Collapsible section | blocks | ✔ | ⌘⇧6 |
| 13 | Blockquote | blocks | ✔ | ⌥⇧. |

Groups are unlabelled — **there are no section heading strings**, only three
hairline separators. Keyboard hints are bare `<kbd>` glyphs (no chip), each
preceded by a 1×1 visually-hidden a11y span spelling the chord
(`"Command Option 1"`, `"Option Shift ."`).

**Search-only items** (not rendered in the resting list, reachable by typing):

| query | reveals |
|---|---|
| `table`, `tab`, `ta`, `a` | **Table** |
| `divider`, `line`, `hr`, `rule`, `separator` | **Divider** |
| `date` | **Date** |

Fuzzy aliases proven: `image`/`video` → Insert media…; `toggle` → Collapsible
section; `quote` → Blockquote; `file` → Attach files…; `graph`/`chart`/`mermaid`
→ Diagram.

Not present under any query tried: mention, math/equation, embed/iframe/youtube,
callout/note/warning/panel, columns, template, footnote, excalidraw, "Text"/
"Paragraph"/"Plain".

**Empty state:** `No results found` + a `Dismiss` row.

Chrome (dark):

| part | value |
|---|---|
| popover | 227 × 470 (max), bg `lch(12.72 0.85 272)`, radius **10px**, border **0.5px solid `lch(25.68 1.93 272)`**, shadow `lch(0 0 0/.125) 0 3px 8px, lch(0 0 0/.125) 0 2px 5px, …` |
| list | padding `4px 0` |
| row | 226 × **34**, padding `0 14px`, radius **0** |
| row inner | 198 × 28, padding `6px 0` |
| label | **13px / 450**, `lch(100 0 272)`, Inter Variable |
| icon | 16 × 16, `fill: lch(64.714 1.425 272)` |
| kbd | **bare glyph**, 11px / 500, `lch(64.714 1.425 272)`, no background, no radius, no border |
| separator | 11px tall block containing a 226 × 1 hairline |

### 1.2 Ours — 10 rows

`Heading 1 ⌘⌥1 · Heading 2 ⌘⌥2 · Heading 3 ⌘⌥3 · ―― · Bulleted list ⌘⇧8 ·
Numbered list ⌘⇧9 · Checklist ⌘⇧7 · ―― · Insert media… · Insert gif… ·
Attach files… ⌘⇧U · ―― · Code block ⌘⇧\`

Missing vs Linear: **Diagram, Collapsible section, Blockquote** (visible rows)
and **Table, Divider, Date** (search-only).

Search is much narrower — `/image`, `/quote`, `/toggle`, `/file`… only `/file`
matched (`Attach files…`); `/image` did **not** reach `Insert media…`.
There is **no empty-results row** — the menu simply unmounts on a non-matching
query (`/xyzzy` → nothing).

Chrome (dark):

| part | Linear | Ours |
|---|---|---|
| popover | 227 × 470, r 10px, 0.5px border, 3-layer shadow | **240 × 320**, bg `rgb(33,33,34)`, r **12px**, border **1px `rgb(60,61,64)`**, **shadow all-transparent (none visible)** |
| card padding | `4px 0` | `4px 6px 4px 4px` |
| row | 226 × 34, `0 14px`, radius 0 | **228 × 32**, `0 8px`, radius **8px** |
| active row bg | (not captured) | `rgb(49,50,52)` |
| label | 13px/450 Inter Variable | **12.5px/400 lh 18.75px**, Geist |
| icon | 16×16 filled, `lch(64.714 1.425 272)` | 16×16 **stroked**, `rgb(151,152,154)` |
| kbd | bare glyph 11px/500 | **16 × 16 chip**, bg `white/6%`, radius 4px, 9.5px/500 |
| separator | inside an 11px block | 228 × 1, `rgb(60,61,64)`, margin `4px 0` |

---

## 2 · Markdown input rules

Every cell below was typed character-by-character with real key events and the
resulting first/last block HTML read back.

| rule | Linear | Ours |
|---|---|---|
| `# ` … `### ` | h1/h2/h3 ✔ | ✔ |
| `#### ` | **h4 ✔** | ✘ stays text |
| `##### ` / `###### ` | ✘ (H5/H6 do not exist) | ✘ |
| `- ` / `* ` / `+ ` | bullet ✔ | ✔ |
| `1. ` | ordered ✔ | ✔ |
| `1) ` | ✘ | ✘ |
| `[] ` / `[ ] ` | todo_list ✔ | taskList ✔ |
| `[x] ` | **✘ stays text** | **✔ creates a *checked* item** (`data-checked="true"`) |
| `> ` | blockquote ✔ | ✔ |
| ` ``` ` (fence) | **code block ✔** (`data-detected-language="plaintext"`) | **✘ stays text** |
| `~~~ ` | ✘ | ✘ |
| `--- ` / `*** ` / `___ ` | horizontal rule ✔ (`div.horizontal-rule-node > hr`) | ✔ (bare `<hr contenteditable=false>`) |
| `**bold** ` | ✔ | ✔ |
| `*italic* ` / `_italic_ ` | ✔ | ✔ |
| `***bold italic*** ` | **✘** (at line start it fires the HR rule instead; mid-line it stays literal) | ✘ |
| `__u__ ` | → **strong** (not underline) | → **strong** (same) |
| strikethrough | **`~s~` (single tilde) ✔; `~~s~~` ✘** | **`~~s~~` ✔; `~s~` ✘** — inverted |
| `` `code` `` | ✔ `<code class="inline">` | ✔ `<code>` |
| `[text](url) ` | **✔ real `<a>`** | **✘ stays literal** |
| `:emoji: ` | **✔** → `span.nodeview-emoji` with the glyph | **✘** |
| `:` + 2 chars | **✔ emoji picker** (191 × 417, glyph + `:shortcode:` rows) | ✘ nothing |
| bare URL + space | autolink ✔ | autolink ✔ |
| `@` | **✔ universal mention menu** (351px wide; sections observed: Users, Projects, Documents, Teams, Views, Pull requests) | ✘ literal `@` |
| `+` | ✘ | ✘ |
| `#` | ✘ | ✘ |
| `x -- y ` → em dash | **✔** (`x — y`; `a--b` without spaces does *not* fire) | ✘ |
| `->` → `→` | **✔** | ✘ |
| `...` → `…` | **✔** | ✘ |
| `"q"` → curly quotes | ✘ (stays straight) | ✘ |
| `==h==`, `^2^`, `$x$`, `$$` | ✘ | ✘ |

---

## 3 · Keyboard shortcuts

Applied with a full-line selection unless noted.

| chord | Linear | Ours |
|---|---|---|
| ⌘B | bold | bold |
| ⌘I | italic | italic |
| ⌘U | underline `<u>` | underline `<u>` |
| ⌘⇧S | **no-op** | **strikethrough** |
| ⌘⇧X | **strikethrough** | **no-op** |
| ⌘E | inline code | inline code |
| ⌘K | **link editor**, input placeholder `Enter link URL` | **opens the GLOBAL command palette** (`Search protocols, builds, docs, team...`) — the link editor is unreachable by keyboard |
| ⌘⇧7 | **Checklist** | **Numbered list** (our own slash menu advertises Checklist) |
| ⌘⇧8 | Bulleted list | Bulleted list |
| ⌘⇧9 | **Numbered list** | **Checklist / task list** (menu advertises Numbered list) |
| ⌘⌥0 | paragraph | paragraph |
| ⌘⌥1 / 2 / 3 | h1 / h2 / h3 | h1 / h2 / h3 |
| ⌘⌥4 | **h4** | no-op |
| ⌘⇧6 | Collapsible section | no-op |
| ⌘⇧\ | **code block** | **no-op** (our slash menu still prints ⌘⇧\ as the hint) |
| ⌘⌥C | — | **code block** (ours only) |
| ⌥⇧. | **blockquote** | no-op |
| ⌘⇧B | — | **blockquote** (ours only) |
| Tab / ⇧Tab in a list | indent / outdent ✔ | indent / outdent ✔ |
| ⌥↑ / ⌥↓ | **move block up/down ✔** | **✘ nothing** |
| ⌘↑ / ⌘⇧↑ / ⌘⌥↑ | no move (caret only) | no move |
| ⌘⇧K | no-op | opens the global command palette |
| ⌘⇧U | Attach files (file picker) | no-op |
| ⌘A | selects the whole body in one press | selects the whole body in one press |
| Esc | closes menus / link editor | closes menus |

---

## 4 · Node types

| node | Linear | Ours |
|---|---|---|
| paragraph, h1–h3 | ✔ | ✔ |
| **h4** | ✔ (`⌘⌥4`, `#### `, "Regular text" dropdown) | ✘ |
| bullet / ordered list | ✔ | ✔ |
| task list | ✔ `ul[data-type=todo_list]` + drag grip | ✔ `ul[data-type=taskList]`, no grip |
| blockquote | ✔ | ✔ (no slash item, only ⌘⇧B / `> `) |
| code block | ✔ `pre.block-node` + language detect | ✔ react node-view `pre` |
| horizontal rule / divider | ✔ (`/divider`, `--- `) | ✔ (`--- ` only, no slash item) |
| image | ✔ `div.nodeview-image` + upload state + resize handles | ✔ `div.node-image` react renderer |
| gif picker | ✔ (`Insert gif…`) | slash item present — see *Not measured* |
| file attachment | ✔ (`Attach files…`, ⌘⇧U) | slash item present — see *Not measured* |
| **table** | ✔ 2 × 3 (`th` header row) | ✘ |
| **collapsible section / toggle** | ✔ `div.collapsible-section[role=region][data-open]` with a `.collapse-toggle` chevron button | ✘ |
| **diagram** | ✔ (`/diagram`, aliases graph/chart/mermaid) | ✘ |
| **date chip** | ✔ `span.nodeview-date` mention chip + a month calendar popover | ✘ |
| **inline emoji node** | ✔ `span.nodeview-emoji[data-emoji]` | ✘ |
| **issue mention chip** | ✔ `span.nodeview-issueMention` (from `@` or a pasted issue URL) | ✘ |
| **entity mention chip** (doc / project / team / view / user / PR) | ✔ `span.nodeview-entityMention` | ✘ |
| link mark | ✔ `target=_blank rel="noopener noreferrer nofollow"` | ✔ identical attrs |
| comment mark | ✔ (`show-inline-comments` on the editor) | ✔ (`span[data-comment]` in our body) |
| math, footnote, embed/iframe, callout, columns | ✘ | ✘ |

---

## 5 · Per-node chrome

### 5.1 Code block toolbar — near-parity

| | Linear | Ours |
|---|---|---|
| container | 137 × 32, top-right inside the `pre`, `opacity:0` at rest → 1 on hover | 153 × 32, same placement + hover reveal |
| 1 | `Change language` **80 × 27**, label `Plaintext` + 14px caret | `Change language` **96 × 27**, label `Plaintext` + 14px caret |
| 2 | `Enable line wrap` 26 × 26 | `Enable line wrap` 26 × 26 |
| 3 | `Copy content` 26 × 26 | `Copy content` 26 × 26 |

Linear's language list is 177px wide, 441px tall, **38 entries**:
Auto detect, Bash, C#, C++, CSS, Clojure, Cypher, Dart, Diff, Elixir, Excel,
Golang, GraphQL, HTML, Haskell, JSON, Java, JavaScript, Kotlin, Makefile,
Markdown, OCaml, PHP, Perl, Plaintext, Python, R, ReScript, ReasonML, Ruby,
Rust, SQL, Swift, TOML, Terraform, TypeScript, XML, YAML.
Ours is **the same 38 entries in the same order** (`Auto detect … YAML`), popover
176 × 318 (Linear 177 × 441). Full parity on contents.

### 5.2 Image node toolbar (Linear)

Floating 170 × 31 over the image, in order:
`View image` · `Download` · `Copy image` · `Copy link` · │ 1 × 18 divider │ · `Add comment`
— each a 26 × 26 hit with a 14 × 14 glyph.
Plus two `_resizeHandle_` strips, 5px wide, one on each side, `opacity: 0` at rest.
Upload lifecycle is on the node: `data-upload-id`, `data-upload-state="uploading" → "finished"`.

Ours: image renders (`div.node-image` react node-view, `group/img` wrapper,
`max-h-[42…]` clamp) — see *Not measured* for its controls.

### 5.3 Table (Linear only)

Inserted shape: 2 columns × 3 rows, first row `th`.

| part | measurement |
|---|---|
| container | `div.tableContainer` 805 × 133; `div.table-wrapper` bleeds to 1203px wide |
| table | 781 × 104, bg `lch(5.52 0.4 272)` |
| header cells | `th` 390 × 34, bg `lch(7.32 0.85 272)` |
| body cells | `td` 390 × 35, `div.cell-container` > `div.cell-content` |
| `Table actions` | 20 × 20 in the left gutter at x = −28 from the table edge, behind a 36 × 48 `editor-menu-button-background-fade` |
| add-row bar | 781 × 18 below the table, bg `lch(9.345 0.85 272)`, 12 × 12 plus glyph right-aligned |
| add-column bar | 18 × 104 to the right of the table, same bg, 12 × 12 plus glyph |
| resize handles | 390 × 3 (column, above the cell) and 3 × 34 (row, left of the cell), as `node-controls` widgets inside `cell-content` |

`Table actions` menu: 105 × 116 — **Copy · Select · Delete**.
No per-row / per-column grip appeared on hovering a row edge or a column top.

### 5.4 Block gutter handles (Linear)

Only **headings** get one: `Heading actions`, 20 × 20 at x = −28 from the text
edge, wrapped in `span.heading-menu-button-container.ProseMirror-widget`.
Menu is 168 × 74 — **Copy link · Make collapsible**.
Paragraphs, bullets, ordered items and blockquotes get **no** gutter handle.
Task items get the 6 × 10 grip (§0). Tables get `Table actions`.

Ours: no gutter handle on any block type (hover sweep over h1 / p / ul returns `[]`).

---

## 6 · Selection toolbar

Both are 35px tall, radius 8px, buttons 26 × 26 radius 4px, dropdown triggers
42 × 26, one 1 × 16 divider. Linear bg `lch(12.72 0.85 272)`; ours `rgb(33,33,34)`.

| slot | Linear (493px wide) | Ours (429px wide) |
|---|---|---|
| 1 | `Regular text` ▾ | `Regular text` ▾ (label "Aa") |
| 2 | Bold | Bold |
| 3 | Italic | Italic |
| 4 | Strikethrough | Strikethrough |
| 5 | Underline | Underline |
| 6 | Link | Link |
| 7 | Quote | Quote |
| 8 | **Collapse** | — |
| 9 | Inline code | Inline code |
| 10 | Code block | Code block |
| 11 | `List` ▾ | `List` ▾ |
| — | divider | divider |
| 12 | **Create issue from selection** | — |
| 13 | **Ask agent** | — |
| 14 | Comment | — |
| 15 | — | **Move selection to new document** (ours only) |
| 16 | — | Comment |

**Dropdowns**

- Linear `Regular text` → 200 × 149: Regular text ⌘⌥0 · Heading 1 ⌘⌥1 ·
  Heading 2 ⌘⌥2 · Heading 3 ⌘⌥3 · Heading 4 ⌘⌥4.
- Linear `List` → 200 × 93: List · Numbered list · Checklist.
- **Ours: neither dropdown opens.** Guarded three ways: (a) a real
  mouse-press on the trigger unmounts the whole toolbar *before* mouseup while
  `getSelection()` still returns the selected text; (b) after mouseup no
  `[role=menu]`/`[role=listbox]` node exists and `document.body.innerHTML`
  shrank by ~18KB (the toolbar left, nothing arrived); (c) a scripted
  `button.click()` with the selection live also produces no menu. For contrast,
  the same mouse path on `Bold` *does* apply bold — so the handler runs; it is
  specifically the two menus that never render. **Dead affordance.**

**Inside a code block**

- Linear collapses the toolbar to **95 × 27 with a single `Comment` button**.
- Ours shows the **full 12-button set** unchanged — Bold/Italic/Heading/List all
  offered over code text.

Image selection → Linear swaps to the image node toolbar (§5.2). Table selection
→ `Table actions` (§5.3). Ours has neither.

---

## 7 · Paste behaviour

Driven by dispatching a real `ClipboardEvent('paste')` with a populated
`DataTransfer` on the editor DOM node (ProseMirror's own paste path).

| paste | Linear | Ours |
|---|---|---|
| URL over a text selection | wraps the selection in `<a href>` ✔ | wraps the selection ✔ |
| bare URL | autolinks in place ✔ | autolinks ✔ |
| **markdown text** | **parsed** — `# MD Heading` → `h1`, `- one/- two` → `ul`, `**bold**` → `strong`, ` ```js ` → code block (5 blocks) | **not parsed** — every line lands as a literal `<p>`, including the ``` ``` `` fences |
| **Linear issue URL** | becomes `span.nodeview-issueMention` — an inline chip with the issue icon and identifier | plain autolink `<a href=…>https://linear.app/…</a>` |
| **Linear document URL** | becomes `span.nodeview-entityMention` chip | (n/a — no equivalent internal-URL handling) |
| image file | uploads: `data-upload-state="uploading"` → `"finished"`, `blob:` src swapped for the stored URL | uploads, renders `div.node-image` react node-view |

---

## 8 · Placeholders and empty states

| surface | Linear | Ours |
|---|---|---|
| title, empty | `New document` (`p.editor-placeholder[data-empty-text]`) | `New document` (`<textarea placeholder>`) — **parity** |
| body, whole doc empty | `Start writing…` (`p.text-node.editor-placeholder[data-empty-text][aria-hidden=true]`), shown focused **and** blurred | see *Not measured* |
| empty line mid-document | **nothing** — the paragraph is bare `<p><br class="ProseMirror-trailingBreak"></p>` | **`Type / for commands…`** rendered as an inline `span.ProseMirror-widget` (`Type` + `<kbd>/</kbd>` + `for commands…`) on **every** empty paragraph, focused **or** blurred |
| slash menu, no match | `No results found` + `Dismiss` row | **no empty state** — the menu unmounts |
| body aria | `aria-label="Document content"` | none |
| title aria | `aria-label="Document title"` | none (native textarea) |

---

## 9 · The diff table

`Delta` ∈ `missing` (we have nothing) · `differs` (both exist, behave/look
differently) · `partial` (we have some of it) · `parity`.

Sorted `missing` → `differs` → `partial` → `parity`.

| Feature | Linear | Ours | Delta |
|---|---|---|---|
| Task-list drag grip | 6 × 10 six-dot svg, 14 × 24 hit box, opacity 0→1 on row hover, fill `rgb(86,87,89)`→`rgb(149,149,151)`, HTML5 drag reorders | nothing in the gutter | missing |
| Drag-to-reorder a list item | yes (vertical; depth follows drop position) | no | missing |
| Table node | 2 × 3 with header row, add-row / add-col bars, resize handles, Copy/Select/Delete menu | none | missing |
| Collapsible section | `⌘⇧6`, slash item, toolbar `Collapse` button, `Make collapsible` on headings | none | missing |
| Diagram node | slash item + aliases graph/chart/mermaid | none | missing |
| Date chip + calendar picker | `/date` → `nodeview-date` chip, month calendar | none | missing |
| Heading 4 | `####`, ⌘⌥4, "Regular text" dropdown | none | missing |
| `@` mention menu | 351px menu across Users / Projects / Documents / Teams / Views / Pull requests | `@` is literal | missing |
| Issue-URL → mention chip on paste | `nodeview-issueMention` | plain link | missing |
| Doc/entity-URL → mention chip on paste | `nodeview-entityMention` | plain link | missing |
| Emoji: `:shortcode:` rule + `:xx` picker | both | neither | missing |
| Markdown parsed on paste | h1/lists/marks/code fence all reconstructed | literal text lines | missing |
| Fenced-code input rule ` ``` ` | code block | literal text | missing |
| `[text](url)` link input rule | real link | literal text | missing |
| Smart typography (`--`, `->`, `...`) | em dash, arrow, ellipsis | none | missing |
| Move block ⌥↑ / ⌥↓ | reorders the block | nothing | missing |
| Heading gutter handle + menu | `Heading actions` 20 × 20, Copy link / Make collapsible | none | missing |
| Toolbar `Create issue from selection` | present | none | missing |
| Toolbar `Ask agent` | present | none | missing |
| Toolbar `Collapse` | present | none | missing |
| Slash: Blockquote row | present (⌥⇧.) | absent (node exists, no slash entry) | missing |
| Slash: Divider row | search-only `Divider` | absent (`---` still works) | missing |
| Slash empty-results state | `No results found` + `Dismiss` | menu unmounts silently | missing |
| Image node toolbar | View / Download / Copy image / Copy link │ Add comment + side resize handles | not measured, but no equivalent surfaced | missing |
| Selection-toolbar dropdowns | `Regular text` and `List` both open menus | both are dead — trigger unmounts the toolbar on mousedown, no menu ever renders | differs |
| ⌘K | link editor, placeholder `Enter link URL` | opens the **global command palette** | differs |
| ⌘⇧7 / ⌘⇧9 | Checklist / Numbered list | Numbered list / Checklist — **swapped**, and both disagree with our own menu hints | differs |
| ⌘⇧\ (code block) | works | no-op; ours binds ⌘⌥C, yet still prints ⌘⇧\ in the slash menu | differs |
| Strikethrough chord | ⌘⇧X (⌘⇧S is a no-op) | ⌘⇧S (⌘⇧X is a no-op) | differs |
| Blockquote chord | ⌥⇧. | ⌘⇧B | differs |
| Strikethrough input rule | `~s~` single tilde | `~~s~~` double tilde | differs |
| `[x] ` input rule | does not convert | converts to a **checked** task | differs |
| Selection toolbar inside a code block | collapses to 95 × 27, `Comment` only | full 12-button set | differs |
| Empty-line placeholder | none mid-document | `Type / for commands…` on every empty paragraph, even blurred | differs |
| Slash-menu chrome | 227 wide, r 10, 0.5px border, 3-layer shadow, rows 34px `0 14px` radius 0, 13px/450 Inter, bare kbd glyphs | 240 wide, r 12, 1px border, no shadow, rows 32px `0 8px` radius 8, 12.5px/400 Geist, 16 × 16 kbd chips | differs |
| Slash-menu search | fuzzy aliases (`image`→media, `toggle`→collapsible, `hr`→divider) | prefix-ish, `/image` misses `Insert media…` | differs |
| Task-item gutter | 24px, `div[role=checkbox]`, radius 3px | 22px, `<input type=checkbox>` inside a `<label>` | differs |
| Image node (rendered result) | 805-wide node, real bitmap, resize handles | node inserts but measures **805 × 0** — the pasted PNG never paints | differs |
| Code-block language picker | 38 entries, 177 × 441 | **same 38 entries, same order**, 176 × 318 | parity |
| Slash menu item set | 13 visible + 3 search-only | 10 visible, 0 search-only | partial |
| Horizontal rule | `div.horizontal-rule-node > hr` node wrapper | bare `<hr contenteditable=false>` | partial |
| Headings 1–3 (rule, chord, menu) | ✔ | ✔ | parity |
| Bullet / ordered / task input rules | ✔ | ✔ | parity |
| `> ` blockquote rule | ✔ | ✔ | parity |
| `---`/`***`/`___` rule | ✔ | ✔ | parity |
| `**b**`, `*i*`, `_i_`, `` `c` ``, `__u__`→strong | ✔ | ✔ | parity |
| Autolink on space / on paste | ✔ | ✔ | parity |
| URL pasted over a selection → link | ✔ | ✔ | parity |
| ⌘B / ⌘I / ⌘U / ⌘E | ✔ | ✔ | parity |
| ⌘⌥0–3 | ✔ | ✔ | parity |
| ⌘⇧8 bulleted list | ✔ | ✔ | parity |
| Tab / ⇧Tab indent-outdent | ✔ | ✔ | parity |
| ⌘A selects the whole body in one press | ✔ | ✔ | parity |
| Code-block toolbar composition + hover reveal | language ▾ / wrap / copy, `opacity:0` at rest | same three, same order, same reveal | parity |
| Image paste-upload | ✔ | ✔ | parity |
| Title placeholder string | `New document` | `New document` | parity |
| Selection-toolbar shell (h 35, r 8, 26 × 26 r 4, 42 × 26 triggers, 1 × 16 divider) | ✔ | ✔ | parity |

**Counts:** `missing` 24 · `differs` 14 · `partial` 2 · `parity` 17 — 57 rows.

---

## 10 · Not measured

Real gaps — none of these were reached, and each is a live question:

1. **`Insert media…`, `Insert gif…`, `Attach files…` end-to-end** — both apps.
   Activating them opens an OS file picker (or, for gif, a third-party picker)
   that CDP cannot drive. Only the menu rows were captured. The **file
   attachment row** node chrome asked for in the brief is therefore unmeasured
   in both apps.
2. **Our image node's controls.** Tried twice. The node inserts
   (`div.node-image` react node-view, `group/img relative my-2 w-fit max-w-full`,
   `img.max-h-[42…]`) but measures **805 × 0** — the pasted PNG never paints, so
   hover and click produced no chrome to capture. Whether that is an upload
   failure in this local session or a real rendering bug is unresolved, and it
   blocks measuring our image toolbar / resize handles. Linear's is fully
   captured (§5.2).
3. **Our empty-document body placeholder.** The test document has content and I
   would not wipe a non-test doc. Linear's is `Start writing…`. Create a fresh
   doc in our app to capture ours.
4. **Linear's `Diagram` node interior.** Selected from the slash menu was never
   completed — the node's editor surface, toolbar and states are unknown.
5. **Linear's collapsible section in the *collapsed* state**, and its per-node
   chrome. Only the freshly-inserted open state (`data-open="true"`,
   `data-empty="true"`, `.collapse-toggle` chevron `<button>`) was captured.
6. **Linear's `@` menu section list is incomplete.** Six sections were observed
   by probing this workspace's data (Users, Projects, Documents, Teams, Views,
   Pull requests). Issues, Cycles and Initiatives almost certainly appear too —
   no query in this workspace surfaced them, so they are unproven.
7. **Hover / focus / active / disabled matrices for both slash menus and both
   selection toolbars.** Only resting geometry plus the one hover state needed
   for the drag grip were captured. `capture_css_spec` was not run.
8. **Linear's slash-menu row hover background.** Ours is `rgb(49,50,52)` on the
   active row; the Linear equivalent was not read.
9. **Linear's `Table actions` submenu behaviour** — `Select` and `Copy` were
   listed but not activated, and clicking through the menu appears to have
   removed the table once, which was not re-investigated.
10. **Our `<hr>` and blockquote hover/selection chrome** — no node toolbars were
    looked for on those.
11. **Multiplayer / comment surfaces** (inline comment threads, `show-inline-comments`)
    were out of scope and untouched in both apps.
12. **Animation timings.** No `capture_animation` / `verify_animation` runs;
    the only motion fact recorded is that Linear declares no transition on the
    drag grip and an 80ms colour transition on the todo checkbox.

Harness caveats worth knowing before re-running:

- Typing `/` while the Linear editor is *not* focused navigates the tab to
  `/search`. Every probe must assert focus first (`body.contains(activeElement)`)
  and re-navigate if the URL is no longer a `/document/` path.
- `⌘⇧↓` in our editor does **not** extend the selection to the document end —
  it moves the caret, so a following `Backspace` silently eats one character.
  Use ⌘Z-to-signature for rollback instead, and make the signature include the
  child **tag list**, not just counts and text length (a count-only signature
  false-positived and left a stray `<ul>` that invalidated a whole sweep).
