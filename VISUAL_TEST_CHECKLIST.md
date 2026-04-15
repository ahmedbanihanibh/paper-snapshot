# 📸 Visual Test Checklist

Use this checklist while testing to ensure everything works correctly.

## ✅ Pre-Test Setup

- [ ] Chrome extension loaded at `chrome://extensions/`
- [ ] Test page open: `file:///Users/ahmedbanihani/Documents/paper-snapshot/test-page.html`
- [ ] OpenPencil open: `http://localhost:1420`
- [ ] Dev server running (check terminal)

---

## 🧪 Test 1: Simple Button (Primary)

### Capture Steps
- [ ] Click extension icon in Chrome toolbar
- [ ] Hover over purple "Primary Button"
- [ ] Button highlights with blue outline
- [ ] Click to select
- [ ] Preview dialog opens
- [ ] See 5 buttons: Cancel, Paper, **OpenPencil**, React CSS, Claude/v0
- [ ] Click "Copy for OpenPencil"
- [ ] Toast shows: "Copied for OpenPencil! Paste into OpenPencil app with Cmd+V."

### Paste & Verify in OpenPencil
- [ ] Switch to OpenPencil tab
- [ ] Press `Cmd+V` (Mac) or `Ctrl+V` (Windows)
- [ ] Element appears at canvas center
- [ ] Element is selected (blue outline)

### Visual Verification
Compare side-by-side with original:
- [ ] **Background**: Purple gradient (left: #667eea, right: #764ba2)
- [ ] **Text Color**: White
- [ ] **Text Content**: "Primary Button"
- [ ] **Font Size**: 14px
- [ ] **Font Weight**: 600 (Semi-bold)
- [ ] **Border Radius**: 8px (rounded corners)
- [ ] **Padding**: 12px top/bottom, 24px left/right
- [ ] **Shadow**: Blue glow visible below button

### Layers Panel
- [ ] New FRAME node appears
- [ ] Contains TEXT child node
- [ ] Name reflects button element

### Properties Panel
- [ ] **Fill**: Type = GRADIENT_LINEAR
- [ ] **Gradient Stops**: 2 stops visible
- [ ] **Stop 1**: Purple (#667eea) at 0%
- [ ] **Stop 2**: Purple (#764ba2) at 100%
- [ ] **Effects**: DROP_SHADOW listed
- [ ] **Corner Radius**: 8
- [ ] **Width**: ~110-120px
- [ ] **Height**: ~38-40px

---

## 🧪 Test 2: Card Component

### Capture Steps
- [ ] Click extension icon
- [ ] Hover over white card (entire card, not just button inside)
- [ ] Card highlights
- [ ] Click to select
- [ ] Click "Copy for OpenPencil"
- [ ] Toast notification appears

### Visual Verification
- [ ] **Background**: White (#ffffff)
- [ ] **Border Radius**: 16px
- [ ] **Shadow**: Large, soft shadow visible
- [ ] **Padding**: 32px all sides
- [ ] **Heading**: "Beautiful Card Component" visible
- [ ] **Badge**: Green "New" badge visible
- [ ] **Paragraph text**: Gray color, readable
- [ ] **Input field**: Email input with border
- [ ] **Buttons**: Two buttons at bottom

### Layers Panel
- [ ] Main FRAME (card container)
- [ ] TEXT node (heading)
- [ ] TEXT node (badge)
- [ ] TEXT node (paragraph)
- [ ] FRAME (input group)
- [ ] FRAME (button group) with horizontal auto-layout
- [ ] Two FRAME children (buttons)

### Properties Panel (Card FRAME)
- [ ] **Fill**: Solid white
- [ ] **Effects**: DROP_SHADOW with blur ~60px
- [ ] **Corner Radius**: 16
- [ ] **Padding**: 32px all sides
- [ ] **Width**: ~500px

---

## 🧪 Test 3: Navigation Bar

### Capture Steps
- [ ] Click extension icon
- [ ] Hover over navbar (white bar at top)
- [ ] Click to select
- [ ] Click "Copy for OpenPencil"

### Visual Verification
- [ ] **Background**: White with blur effect (rgba(255,255,255,0.95))
- [ ] **Border Radius**: 12px
- [ ] **Layout**: Logo on left, links on right
- [ ] **Spacing**: Space between logo and nav
- [ ] **Nav Links**: "Home", "Features", "Pricing", "Docs"
- [ ] **Gap**: Links have spacing between them

### Layers Panel
- [ ] Main FRAME (navbar)
- [ ] TEXT node (logo "OpenPencil")
- [ ] FRAME (nav) with horizontal auto-layout
- [ ] Four TEXT nodes (nav links)

### Properties Panel (Navbar FRAME)
- [ ] **Layout Mode**: HORIZONTAL
- [ ] **Primary Axis**: SPACE_BETWEEN
- [ ] **Counter Axis**: CENTER
- [ ] **Padding**: 16px top/bottom, 24px left/right
- [ ] **Corner Radius**: 12
- [ ] **Width**: ~800px

---

## 🧪 Test 4: Feature Card

### Capture Steps
- [ ] Click extension icon
- [ ] Hover over one purple feature box
- [ ] Click to select
- [ ] Click "Copy for OpenPencil"

### Visual Verification
- [ ] **Background**: Purple gradient (same as button)
- [ ] **Border Radius**: 12px
- [ ] **Shadow**: Purple glow visible
- [ ] **Padding**: 24px all sides
- [ ] **Emoji**: Emoji visible in heading
- [ ] **Heading**: White text, bold
- [ ] **Description**: White text, slightly transparent

### Properties Panel
- [ ] **Fill**: GRADIENT_LINEAR
- [ ] **Effects**: DROP_SHADOW
- [ ] **Corner Radius**: 12
- [ ] **Padding**: 24px

---

## 🧪 Test 5: Secondary Button

### Capture Steps
- [ ] Click extension icon
- [ ] Hover over "Secondary Button" (white with purple border)
- [ ] Click to select
- [ ] Click "Copy for OpenPencil"

### Visual Verification
- [ ] **Background**: White
- [ ] **Border**: 2px solid purple (#667eea)
- [ ] **Text**: Purple color
- [ ] **Border Radius**: 8px
- [ ] **Padding**: Same as primary button

### Properties Panel
- [ ] **Fill**: Solid white
- [ ] **Strokes**: 1 stroke listed
- [ ] **Stroke Weight**: 2
- [ ] **Stroke Color**: Purple
- [ ] **Stroke Align**: INSIDE

---

## 🎯 Overall Verification

After completing all tests:

### Functionality
- [ ] All elements can be captured
- [ ] All elements paste successfully
- [ ] No errors in browser console
- [ ] No errors in OpenPencil console
- [ ] Toast notifications appear correctly

### Visual Fidelity
- [ ] Colors match exactly (use eyedropper to verify)
- [ ] Gradients render correctly
- [ ] Shadows are visible and match
- [ ] Spacing and padding match
- [ ] Border radius matches
- [ ] Typography matches (font, size, weight)

### Node Structure
- [ ] Correct node types (FRAME, TEXT)
- [ ] Proper hierarchy
- [ ] Auto-layout applied to flexbox
- [ ] Alignment settings correct

### Edge Cases
- [ ] Can paste multiple elements
- [ ] Each element maintains its properties
- [ ] Undo works (Cmd+Z)
- [ ] Can delete pasted elements
- [ ] Can edit pasted elements (change colors, text, etc.)

---

## 🐛 Issues to Report

If you find issues, note:

1. **Element captured**: _____________________
2. **What's wrong**: _____________________
3. **Expected**: _____________________
4. **Actual**: _____________________
5. **Screenshot**: (take before/after screenshots)
6. **Console errors**: (check both Chrome and OpenPencil)

---

## ✅ Sign-Off

**Tester**: _____________________
**Date**: _____________________
**Time**: _____________________

**Overall Result**: ☐ Pass ☐ Fail ☐ Pass with minor issues

**Notes**:
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

**Screenshots attached**: ☐ Yes ☐ No

---

## 📊 Quick Summary

Total Tests: 5
- [ ] Test 1: Simple Button
- [ ] Test 2: Card Component
- [ ] Test 3: Navigation Bar
- [ ] Test 4: Feature Card
- [ ] Test 5: Secondary Button

**Pass Rate**: _____ / 5 (____%)

**Recommendation**: ☐ Ship it! ☐ Needs fixes ☐ More testing needed
