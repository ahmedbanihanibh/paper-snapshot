# 🚀 Quick Start Guide - OpenPencil Extension

## Installation (2 minutes)

### Step 1: Load Extension in Chrome

1. Open Chrome browser
2. Navigate to: `chrome://extensions/`
3. Toggle **"Developer mode"** (top right corner)
4. Click **"Load unpacked"**
5. Navigate to and select: `/Users/ahmedbanihani/Documents/paper-snapshot/`
6. ✅ Extension icon appears in toolbar!

### Step 2: Verify Installation

The extension should show:
- **Name**: UI to Code Snapshot
- **Version**: 1.0.0
- **Status**: Enabled (green toggle)
- No errors in the card

## Quick Test (30 seconds)

### Test with Sample Page

1. **Open test page**: `file:///Users/ahmedbanihani/Documents/paper-snapshot/test-page.html`
2. **Click extension icon** in Chrome toolbar
3. **Hover over the purple "Primary Button"**
4. **Click to select it**
5. **Click "Copy for OpenPencil"** in the preview dialog
6. **Open OpenPencil**: `http://localhost:1420`
7. **Press Cmd+V** (or Ctrl+V)
8. ✅ Button appears with purple gradient!

## What to Expect

When you paste into OpenPencil, you should see:

### In the Canvas
- Element appears at center of viewport
- Visual appearance matches original
- Automatically selected (blue outline)

### In Layers Panel
- New nodes appear (FRAME, TEXT, etc.)
- Hierarchical structure preserved
- Names reflect HTML tags or classes

### In Properties Panel
- **Fill**: Gradient or solid color
- **Effects**: Shadows visible
- **Layout**: Auto-layout if flexbox
- **Corner Radius**: Preserved
- **Text**: Font, size, weight, color

## Supported Elements

✅ **Works Great:**
- Buttons (especially with gradients!)
- Cards with shadows
- Navigation bars
- Form inputs
- Feature cards
- Typography
- Flexbox layouts

⚠️ **Limited Support:**
- SVG elements → Placeholder
- External images → Placeholder
- Grid layouts → Regular FRAME
- Complex animations → Static

## Test on Real Websites

Try these popular sites:

1. **Stripe.com**
   - Capture pricing cards
   - Capture gradient buttons
   - Capture feature sections

2. **Linear.app**
   - Capture navigation bar
   - Capture issue cards
   - Capture sidebar items

3. **Vercel.com**
   - Capture hero buttons
   - Capture feature cards
   - Capture code blocks

## Keyboard Shortcuts

While capturing:
- `Click` or `Enter` → Select element
- `↑` / `↓` → Adjust selection up/down
- `Esc` → Cancel

In preview dialog:
- `Enter` → Copy for Claude/v0 (default)
- `Esc` → Cancel

## Troubleshooting

### Extension doesn't load
- Check Chrome version (requires 88+)
- Look for errors on `chrome://extensions/`
- Try reloading the extension

### Can't select elements
- Refresh the webpage
- Check if page URL is restricted (chrome://, edge://)
- Check browser console for errors

### Paste doesn't work
- Verify clipboard has content (check browser console)
- Ensure OpenPencil is running (`localhost:1420`)
- Try clicking on OpenPencil canvas first

### Styles not preserved
- Check preview tab to see captured HTML
- Some CSS properties may not be supported yet
- External stylesheets aren't captured (only inline styles)

## Button Guide

In the preview dialog, you'll see 5 buttons:

1. **Cancel** - Close without copying
2. **Copy for Paper** - Paper.io format
3. **Copy for OpenPencil** ⭐ - OpenPencil format (use this!)
4. **Copy React CSS** - Raw HTML with styles
5. **Copy for Claude/v0** - AI-optimized format

## Support

If you encounter issues:

1. Check `TEST_INSTRUCTIONS.md` for detailed testing steps
2. Check `OPENPENCIL_INTEGRATION.md` for technical details
3. Look for errors in:
   - Chrome extension console (`chrome://extensions/`)
   - Browser console (F12)
   - OpenPencil console (F12)

## Files in This Directory

- `background.js` - Main extension code
- `manifest.json` - Extension configuration
- `icons/` - Extension icons
- `test-page.html` - Sample page for testing
- `test-clipboard-format.mjs` - Automated test
- `TEST_INSTRUCTIONS.md` - Detailed test guide
- `OPENPENCIL_INTEGRATION.md` - Technical docs
- `QUICK_START.md` - This file!

## Next Steps

After successful testing:

1. ✅ Test with real websites
2. ✅ Compare pasted elements with originals
3. ✅ Test complex layouts (nested flexbox, etc.)
4. ✅ Report any visual differences
5. ✅ Build awesome designs in OpenPencil!

---

**Need Help?** Check the test instructions or technical docs for more details.

**Found a Bug?** Document it with:
- Original element (screenshot)
- Pasted element (screenshot)
- Browser console errors
- Steps to reproduce
