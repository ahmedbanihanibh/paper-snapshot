# OpenPencil Integration

This Chrome extension now supports copying UI elements directly to OpenPencil!

## What's New

Added a **"Copy for OpenPencil"** button that captures any UI element from a live website and formats it for direct paste into OpenPencil.

## How It Works

1. **Capture**: Click the extension icon and select any UI element on a webpage
2. **Copy**: Click the **"Copy for OpenPencil"** button in the preview dialog
3. **Paste**: Open OpenPencil and press `Cmd+V` (Mac) or `Ctrl+V` (Windows)
4. **Design**: The element appears as native OpenPencil nodes with full visual fidelity!

## Technical Details

The extension wraps captured HTML in an `<x-openpencil-html>` tag, which OpenPencil's clipboard system recognizes. The HTML parser converts:

- **Colors & Backgrounds** → Fill objects (solid colors, gradients)
- **Borders** → Stroke objects
- **Shadows** → Effect objects (DROP_SHADOW, INNER_SHADOW)
- **Typography** → TEXT nodes with font properties
- **Layout** → Flexbox becomes Auto-Layout frames
- **Spacing** → Padding values preserved
- **Border Radius** → Corner radius values

## Buttons Available

1. **Copy for Claude/v0** - Simplified HTML for AI code generation
2. **Copy for Paper** - Paper.io design tool format
3. **Copy for OpenPencil** - ✨ NEW! OpenPencil format
4. **Copy React CSS** - Raw HTML with inline styles

## Changes Made

### Added Functions
- `copyToClipboardForOpenPencil()` - Wraps HTML in `<x-openpencil-html>` wrapper

### UI Updates
- New button: "Copy for OpenPencil"
- Button styling matches existing design system
- Hover states for better UX
- Tooltip: "Copy as OpenPencil-compatible snapshot"

### Action Handling
- New action: `"copy-openpencil"`
- Toast notification: "Copied for OpenPencil! Paste into OpenPencil app with Cmd+V."
- Uses `rawHtml` (full inline styles) for maximum fidelity

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `paper-snapshot` directory
5. The extension icon will appear in your toolbar

## Usage Tips

- **Best for**: Buttons, cards, navbars, forms, product cards
- **Preserves**: Colors, spacing, typography, shadows, borders, layout
- **Works with**: Any website (except chrome:// pages)
- **Shortcuts**:
  - Click element or press `Enter` to capture
  - Press `↑`/`↓` to adjust selection
  - Press `Esc` to cancel

## Example Workflow

```
1. Visit a website (e.g., Stripe.com)
2. Click extension icon
3. Hover over a button
4. Click to select it
5. Click "Copy for OpenPencil"
6. Open OpenPencil
7. Press Cmd+V
8. ✨ Button appears as native FRAME + TEXT nodes!
```

## Compatibility

- **Chrome**: Version 88+
- **Edge**: Version 88+
- **OpenPencil**: Latest version with HTML clipboard support
- **Paper**: Still works with "Copy for Paper" button
- **Claude Code**: Still works with "Copy for Claude/v0" button

## Limitations

- SVG elements → Placeholder rectangles (MVP)
- External images → Placeholder (CORS restrictions)
- Complex CSS (animations, transforms) → Static snapshot
- Grid layout → Converted to regular FRAME
- Text with mixed formatting → Single style (MVP)

## Future Enhancements

- SVG path parsing → Native VECTOR nodes
- External image fetching
- CSS Grid layout support
- Text range formatting (bold/italic spans)
- Pseudo-elements (::before, ::after)
- CSS variables resolution
