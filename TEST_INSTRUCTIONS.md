# OpenPencil Extension Test Instructions

## Setup (5 minutes)

### 1. Install the Chrome Extension

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select this directory: `/Users/ahmedbanihani/Documents/paper-snapshot/`
6. The extension icon should appear in your toolbar

### 2. Open Test Pages

1. **Test page**: Open `file:///Users/ahmedbanihani/Documents/paper-snapshot/test-page.html` in Chrome
2. **OpenPencil**: Already running at `http://localhost:1420`

## Test Workflow

### Test 1: Simple Button Capture

1. On the test page, click the extension icon in the Chrome toolbar
2. Hover over the **"Primary Button"** (purple gradient button)
3. Click to select it
4. Preview dialog opens - you should see:
   - Cancel
   - Copy for Paper
   - **Copy for OpenPencil** ⭐
   - Copy React CSS
   - Copy for Claude/v0
5. Click **"Copy for OpenPencil"**
6. Toast notification should show: "Copied for OpenPencil! Paste into OpenPencil app with Cmd+V."
7. Switch to OpenPencil browser tab (localhost:1420)
8. Press `Cmd+V` (Mac) or `Ctrl+V` (Windows)
9. **Expected Result**:
   - Button appears as a FRAME node with gradient fill
   - TEXT node inside with "Primary Button"
   - Border radius preserved (8px)
   - Box shadow preserved
   - Padding preserved (12px 24px)
   - Font size 14px, weight 600

### Test 2: Card Component Capture

1. Back on test page, click extension icon
2. Hover over the **white card** (the one with "Beautiful Card Component")
3. Click to select entire card
4. Click **"Copy for OpenPencil"**
5. Switch to OpenPencil
6. Press `Cmd+V`
7. **Expected Result**:
   - FRAME with white background
   - Border radius 16px
   - Box shadow with blur
   - Padding 32px
   - Contains:
     - TEXT node for heading
     - TEXT node for paragraph
     - Input field as FRAME
     - Button group as FRAME with flexbox layout
     - Two button FRAMEs inside

### Test 3: Navbar Capture

1. Click extension icon
2. Hover over the **navbar** (white rounded bar at top)
3. Click to select
4. Click **"Copy for OpenPencil"**
5. Switch to OpenPencil
6. Press `Cmd+V`
7. **Expected Result**:
   - FRAME with horizontal auto-layout
   - justify-content: space-between preserved
   - Background: rgba(255, 255, 255, 0.95)
   - Border radius 12px
   - Logo text on left
   - Nav links on right with gap

### Test 4: Feature Grid Capture

1. Click extension icon
2. Hover over one of the **feature cards** (purple gradient boxes)
3. Click to select
4. Click **"Copy for OpenPencil"**
5. Switch to OpenPencil
6. Press `Cmd+V`
7. **Expected Result**:
   - FRAME with gradient fill (purple gradient)
   - Border radius 12px
   - Box shadow
   - Contains TEXT nodes for emoji, heading, and description
   - Padding 24px

### Test 5: Multiple Elements

1. Capture the Primary Button → Paste in OpenPencil
2. Capture the Secondary Button → Paste in OpenPencil
3. Capture a Feature Card → Paste in OpenPencil
4. **Expected Result**:
   - All three elements appear as separate nodes
   - Each positioned at canvas center
   - Each selected after paste
   - All styles preserved independently

## Verification Checklist

After each paste, verify in OpenPencil:

### Visual Fidelity
- [ ] Colors match exactly (use eyedropper to compare)
- [ ] Gradients preserved (check gradient stops)
- [ ] Shadows visible and correct (check blur, offset, spread)
- [ ] Border radius matches
- [ ] Padding/spacing matches
- [ ] Font size and weight match

### Node Structure
- [ ] Check Layers panel - see FRAME, TEXT, etc.
- [ ] Auto-layout applied for flexbox containers
- [ ] Correct layout mode (HORIZONTAL/VERTICAL)
- [ ] Correct alignment (justify-content, align-items)
- [ ] Gap/spacing correct

### Properties Panel
- [ ] Fill type correct (SOLID or GRADIENT)
- [ ] Gradient stops visible and correct
- [ ] Effects list shows DROP_SHADOW
- [ ] Corner radius values correct
- [ ] Text properties correct (font, size, weight, color)

## Known Limitations (Expected Behavior)

- **SVG elements**: Will appear as placeholder rectangles (MVP)
- **External images**: Will appear as placeholder rectangles (CORS)
- **Hover states**: Only captures current state
- **Animations**: Static snapshot only
- **Complex selectors**: Only inline styles supported

## Troubleshooting

### Extension doesn't appear
- Refresh `chrome://extensions/` page
- Check for errors in the extension console
- Verify manifest.json is valid

### Can't select elements
- Check browser console for errors
- Ensure page is not a restricted URL (chrome://, edge://)
- Try refreshing the page

### Paste doesn't work in OpenPencil
- Check clipboard contains `<x-openpencil-html>` wrapper:
  - Open browser console
  - Run: `navigator.clipboard.readText().then(console.log)`
  - Should see `<x-openpencil-html>...</x-openpencil-html>`
- Verify OpenPencil dev server is running
- Check browser console in OpenPencil for errors

### Styles not preserved
- Check if element has inline styles in the preview
- Some CSS properties may not be fully supported yet
- Check the HTML in preview tab to verify styles are captured

## Success Criteria

✅ Extension loads without errors
✅ Can select elements on test page
✅ Preview dialog shows 5 buttons including "Copy for OpenPencil"
✅ Clicking "Copy for OpenPencil" shows success toast
✅ Pasting in OpenPencil creates native nodes
✅ Visual appearance matches original
✅ Node structure is correct (FRAME, TEXT, etc.)
✅ Properties are preserved (colors, shadows, spacing)
✅ Auto-layout works for flexbox containers
✅ Can paste multiple elements

## Test Results Template

```
Date: ___________
Tester: ___________

Test 1 - Button Capture: ☐ Pass ☐ Fail
Notes: ___________

Test 2 - Card Capture: ☐ Pass ☐ Fail
Notes: ___________

Test 3 - Navbar Capture: ☐ Pass ☐ Fail
Notes: ___________

Test 4 - Feature Card Capture: ☐ Pass ☐ Fail
Notes: ___________

Test 5 - Multiple Elements: ☐ Pass ☐ Fail
Notes: ___________

Overall Result: ☐ Pass ☐ Fail
Issues Found: ___________
```

## Quick Test (1 minute)

For a quick smoke test:

1. Load extension
2. Open test page
3. Click extension icon
4. Click the purple "Primary Button"
5. Click "Copy for OpenPencil"
6. Switch to OpenPencil (localhost:1420)
7. Press Cmd+V
8. ✅ If button appears with purple gradient → **SUCCESS!**

## Next Steps

After successful testing:

1. Take screenshots of captured elements in OpenPencil
2. Compare side-by-side with original
3. Test on real websites (Stripe.com, Linear.app, etc.)
4. Report any visual differences or bugs
5. Test edge cases (very large elements, nested layouts, etc.)
