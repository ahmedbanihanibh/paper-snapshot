# Figma Plugin: UI2Code Snapshot Import

## Overview

This Figma plugin imports HTML snapshots captured by the UI2Code browser extension into native Figma nodes (frames, text, SVG vectors) with proper auto-layout, colors, fonts, and sizing.

## Architecture

```
Browser Extension (background.js)
  ├── Captures DOM element with computed styles
  ├── "Copy for Figma" button → copies rawHtml as text/html
  └── User pastes into Figma plugin UI

Figma Plugin
  ├── ui.html (browser iframe)
  │   ├── Paste event listener → captures text/html from clipboard
  │   ├── DOMParser → parses HTML into layer tree JSON
  │   └── postMessage → sends layer tree to code.js
  │
  └── code.js (Figma sandbox)
      ├── Receives layer tree via figma.ui.onmessage
      ├── Recursively creates Figma nodes
      └── Applies styles, layout, fonts, sizing
```

## Layer Tree Format (ui.html → code.js)

The `ui.html` parser converts HTML into this JSON structure:

```json
{
  "type": "ELEMENT",       // or "TEXT_NODE" or "SVG"
  "tag": "div",
  "styles": {
    "display": "flex",
    "width": "1432px",
    "background-color": "rgb(8, 9, 10)",
    "color": "rgb(247, 248, 248)",
    ...
  },
  "children": [...],
  "text": ""               // for text-only elements
}
```

## CSS → Figma Mapping

### Layout

| CSS | Figma |
|-----|-------|
| `display: flex; flex-direction: row` | `frame.layoutMode = "HORIZONTAL"` |
| `display: flex; flex-direction: column` | `frame.layoutMode = "VERTICAL"` |
| `display: block` | `frame.layoutMode = "VERTICAL"` |
| `display: grid` | `frame.layoutMode = "VERTICAL"` |
| `display: inline` / `contents` | No auto-layout (`"NONE"`) |

### Sizing

| CSS | Figma |
|-----|-------|
| `width: 1432px` (explicit) | `frame.resize(1432, h)` + `primaryAxisSizingMode = "FIXED"` |
| `width: auto` / absent | `primaryAxisSizingMode = "AUTO"` (hug) |
| `width: 100%` | Child: `layoutSizingHorizontal = "FILL"` |
| `flex-grow: 1` | Child: `layoutSizing[Primary] = "FILL"` |
| `min-height: 72px` | `frame.minHeight = 72` |
| `max-width: 620px` | `frame.maxWidth = 620` |

### Alignment

| CSS | Figma |
|-----|-------|
| `justify-content: center` | `primaryAxisAlignItems = "CENTER"` |
| `justify-content: flex-end` | `primaryAxisAlignItems = "MAX"` |
| `justify-content: space-between` | `primaryAxisAlignItems = "SPACE_BETWEEN"` |
| `align-items: center` | `counterAxisAlignItems = "CENTER"` |

### Gap

| CSS | Figma |
|-----|-------|
| `gap: 8px` | `frame.itemSpacing = 8` |
| `column-gap: 8px` (horizontal flex) | `frame.itemSpacing = 8` |
| `row-gap: 8px` (vertical flex) | `frame.itemSpacing = 8` |

### Colors

CSS `rgb(8, 9, 10)` → Figma `{ r: 8/255, g: 9/255, b: 10/255 }` (0-1 float range)

### Text

| CSS | Figma |
|-----|-------|
| `font-size: 13px` | `text.fontSize = 13` |
| `font-weight: 510` | `text.fontName = { family: "Inter", style: "Medium" }` |
| `color: rgb(138, 143, 152)` | `text.fills = [solidPaint]` |
| `text-align: center` | `text.textAlignHorizontal = "CENTER"` |
| `font-family: 'Inter Variable'` | Stripped to `"Inter"` (removes " Variable" suffix) |

### SVG

SVG elements are imported via `figma.createNodeFromSvg(svgString)`. Sizing uses:
1. CSS `height`/`width` from inline styles (highest priority)
2. SVG `height`/`width` attributes
3. Computed from `viewBox` aspect ratio (e.g., `height=22, viewBox="0 0 400 100"` → 88x22px)

## Key Fixes & Decisions

### 1. Transparent Wrapper Bypass

When a `display: block` element has `width: 100%`, no background, no border, and exactly one child, we skip creating a Figma frame and pass the child directly to the parent. This prevents unnecessary VERTICAL wrappers from breaking HORIZONTAL flex flow.

**Example:** `<div style="display:block; width:100%"><ul style="display:flex">...</ul></div>` — the wrapper `div` is skipped, the `ul` is directly appended to the grandparent.

### 2. Position Absolute/Fixed Skipping

Elements with `position: absolute` or `position: fixed` are skipped entirely. These are typically invisible hover overlays, tooltips, or focus indicators that have no visual representation in a static Figma export.

### 3. Text Element Wrapping

Text-only elements are wrapped in a frame (with auto-layout) when they have ANY of:
- Background color
- Border
- Padding (critical for nav items with `padding: 0 12px`)
- Explicit height (e.g., `height: 32px`)

Without this, elements like `<a style="padding: 0 12px">Customers</a>` would lose their padding and render as bare text nodes with no spacing.

### 4. Spacer Div Handling

Empty divs with `flex-grow: 1` and no content (commonly used as flex spacers) are created as 1x1px frames with `layoutSizing = "FILL"` on both axes. This lets them expand to fill available space without imposing a minimum visual size.

### 5. `HUG` Sizing Guard

Figma only allows `layoutSizingHorizontal = "HUG"` on:
- Text nodes
- Frames with auto-layout enabled (`layoutMode !== "NONE"`)

For plain frames (no auto-layout) and SVG nodes, we use `"FIXED"` instead of `"HUG"` to avoid the Figma API error.

### 6. Font Loading Cascade

```
Try requested font family + style
  → Try same family + "Regular"
    → Try "Inter" + requested style
      → Fallback: "Inter" + "Regular"
```

System fonts (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, etc.) are mapped to `"Inter"`. The `" Variable"` suffix is stripped from font family names (e.g., `"Inter Variable"` → `"Inter"`).

### 7. `width: 100%` → FILL

Percentage widths (`100%`) are mapped to `layoutSizingHorizontal = "FILL"` regardless of parent direction. The `px()` helper returns 0 for percentage values to prevent them from being treated as explicit pixel sizes.

## Figma Sandbox Constraints

The Figma plugin sandbox does NOT support:
- Optional chaining (`?.`) — use explicit null checks
- Nullish coalescing (`??`) — use `||`
- `navigator`, `fetch`, `setTimeout` — only available in `ui.html`

All modern JS features (arrow functions, `const`/`let`, `async`/`await`, template literals) ARE supported.

## How to Install & Test

1. Open Figma Desktop app
2. Menu → Plugins → Development → **Import plugin from manifest...**
3. Navigate to `figma-plugin/manifest.json` (NOT the root `manifest.json`)
4. The plugin appears under Plugins → Development → "UI2Code Snapshot Import"

### Testing Workflow

1. Open any website in Edge/Chrome
2. Click the UI2Code extension icon → select an element → click "Copy for Figma"
3. In Figma, run the plugin → click the paste area → Cmd+V
4. Click "Import to Figma"

## File Structure

```
figma-plugin/
  manifest.json        — Figma plugin metadata (api: "1.0.0", editorType: ["figma"])
  code.js              — Sandbox: creates Figma nodes from parsed layer tree
  ui.html              — Browser UI: paste area, HTML parser, sends to code.js
  test-render.html     — Local test page for visual A/B comparison
```

## Reverse Engineering Timeline

1. **Figma clipboard format** — Investigated Figma's proprietary `fig-kiwi` binary clipboard format. Confirmed it cannot be constructed from scratch (encrypted/compressed binary). Pivoted to building a companion Figma plugin instead.

2. **Lottielab clipboard format** — Intercepted copy/paste events in Lottielab's web editor. Discovered the format: `<div id="lottielab-paste"><span id="layers" data-contents="URL_ENCODED_JSON">`. Decoded layer schemas for `shape-layer` (rectangle, ellipse, polygon, star, vector-path), `group-layer`, and `text-layer`. Colors are 0-255 range. Successfully pasted a shape-layer into Lottielab.

3. **Paper clipboard format** — Paper uses `<x-paper-html>` wrapper around raw HTML in `text/html` MIME type. Simplest format of all three.

4. **Figma Plugin API** — Researched the Plugin API, manifest format, sandbox limitations, font loading, auto-layout properties, and node creation methods. Built the plugin with paste-based clipboard access (since `navigator.clipboard.read()` is not available in Figma plugin iframes).
