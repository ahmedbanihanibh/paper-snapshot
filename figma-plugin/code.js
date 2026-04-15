"use strict";

// ============================================================================
// UI2Code Snapshot Import — Figma Plugin
// Receives parsed HTML layer tree from ui.html, creates native Figma nodes
// ============================================================================

figma.showUI(__html__, { width: 420, height: 480, themeColors: true });

// ── Color helpers ───────────────────────────────────────────────────────────
function parseColor(str) {
  if (!str || str === "transparent" || str === "rgba(0, 0, 0, 0)") return null;
  str = str.trim();

  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0,2),16)/255,
        g: parseInt(hex.slice(2,4),16)/255,
        b: parseInt(hex.slice(4,6),16)/255,
        a: parseInt(hex.slice(6,8),16)/255
      };
    }
    return {
      r: parseInt(hex.slice(0,2),16)/255,
      g: parseInt(hex.slice(2,4),16)/255,
      b: parseInt(hex.slice(4,6),16)/255,
      a: 1
    };
  }

  const m = str.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
  if (m) {
    return {
      r: parseFloat(m[1])/255,
      g: parseFloat(m[2])/255,
      b: parseFloat(m[3])/255,
      a: m[4] !== undefined ? parseFloat(m[4]) : 1
    };
  }
  return null;
}

function colorToFill(colorStr) {
  const c = parseColor(colorStr);
  if (!c) return null;
  return { type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
}

function px(val) {
  if (!val) return 0;
  // Percentage values like "100%" should not be treated as pixel numbers
  if (typeof val === "string" && val.indexOf("%") >= 0) return 0;
  return parseFloat(val) || 0;
}

function isPercent100(val) {
  return val === "100%" || val === "100.00%";
}

// ── Parse CSS linear-gradient to Figma gradient fill ────────────────────────
function parseGradientFills(bgImage) {
  if (!bgImage) return [];
  var fills = [];
  // Match each linear-gradient(...) in the string
  var re = /linear-gradient\(([^)]+(?:\([^)]*\)[^)]*)*)\)/g;
  var match;
  while ((match = re.exec(bgImage)) !== null) {
    var inner = match[1];
    // Split by commas, but not commas inside rgba()
    var parts = [];
    var depth = 0, start = 0;
    for (var i = 0; i < inner.length; i++) {
      if (inner[i] === '(') depth++;
      else if (inner[i] === ')') depth--;
      else if (inner[i] === ',' && depth === 0) {
        parts.push(inner.substring(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(inner.substring(start).trim());

    var angle = 180; // default: top to bottom
    var stopStart = 0;
    // Check if first part is an angle
    var angleMatch = parts[0].match(/^(\d+)deg$/);
    if (angleMatch) {
      angle = parseInt(angleMatch[1]);
      stopStart = 1;
    } else if (parts[0] === "to bottom") {
      angle = 180; stopStart = 1;
    } else if (parts[0] === "to top") {
      angle = 0; stopStart = 1;
    } else if (parts[0] === "to right") {
      angle = 90; stopStart = 1;
    } else if (parts[0] === "to left") {
      angle = 270; stopStart = 1;
    }

    var stops = [];
    var totalStops = parts.length - stopStart;
    for (var si = stopStart; si < parts.length; si++) {
      var stopPart = parts[si];
      // Extract color and optional position
      var colorMatch = stopPart.match(/(rgba?\([^)]+\)|#[a-fA-F0-9]+)/);
      var posMatch = stopPart.match(/([\d.]+)%/);
      if (colorMatch) {
        var c = parseColor(colorMatch[1]);
        var pos = posMatch ? parseFloat(posMatch[1]) / 100 : (si - stopStart) / Math.max(totalStops - 1, 1);
        if (c) {
          stops.push({ position: pos, color: { r: c.r, g: c.g, b: c.b, a: c.a } });
        }
      }
    }

    if (stops.length >= 2) {
      // Convert CSS angle to Figma gradientTransform
      // CSS: 0deg = bottom-to-top, 90deg = left-to-right, 180deg = top-to-bottom
      var rad = (angle - 90) * Math.PI / 180;
      var cos = Math.cos(rad);
      var sin = Math.sin(rad);
      fills.push({
        type: "GRADIENT_LINEAR",
        gradientTransform: [
          [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
          [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5]
        ],
        gradientStops: stops,
      });
    } else if (stops.length === 1) {
      // Single color "gradient" = solid fill
      fills.push({ type: "SOLID", color: { r: stops[0].color.r, g: stops[0].color.g, b: stops[0].color.b }, opacity: stops[0].color.a });
    }
  }
  return fills;
}

// ── Parse border-radius (handles "8px", "8px 4px", "8px 4px 2px 1px") ─────
function parseBorderRadius(val) {
  if (!val) return 0;
  const parts = val.split(/\s+/).map(v => parseFloat(v) || 0);
  if (parts.length === 1) return parts[0];
  return parts; // [tl, tr, br, bl]
}

// ── Parse box-shadow into Figma effects ────────────────────────────────────
function parseBoxShadow(val) {
  if (!val || val === "none") return [];
  const effects = [];
  // Simple parser for: "offsetX offsetY blur spread color"
  const shadowRegex = /(inset\s+)?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+([\d.]+)px)?\s+(rgba?\([^)]+\)|#[a-fA-F0-9]+)/g;
  let match;
  while ((match = shadowRegex.exec(val)) !== null) {
    const isInner = !!match[1];
    const c = parseColor(match[6]);
    if (c) {
      effects.push({
        type: isInner ? "INNER_SHADOW" : "DROP_SHADOW",
        color: { r: c.r, g: c.g, b: c.b, a: c.a },
        offset: { x: parseFloat(match[2]), y: parseFloat(match[3]) },
        radius: parseFloat(match[4]),
        spread: match[5] ? parseFloat(match[5]) : 0,
        visible: true,
        blendMode: "NORMAL",
      });
    }
  }
  return effects;
}

// ── Map CSS display/flex to Figma layoutMode ───────────────────────────────
function getLayoutMode(styles) {
  const display = styles.display;
  if (display === "flex" || display === "inline-flex") {
    const dir = styles["flex-direction"] || "row";
    return dir.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  }
  // Grid elements map to vertical auto-layout
  if (display === "grid" || display === "inline-grid") {
    return "VERTICAL";
  }
  // Block elements stack vertically
  if (display === "block" || display === "list-item" || !display) {
    return "VERTICAL";
  }
  return "NONE";
}

// ── Map CSS align-items / justify-content to Figma ─────────────────────────
function mapAlignment(val) {
  if (!val) return "MIN";
  if (val === "center") return "CENTER";
  if (val === "flex-end" || val === "end") return "MAX";
  if (val === "space-between") return "SPACE_BETWEEN";
  return "MIN";
}

// ── Font weight string to Figma style ──────────────────────────────────────
function fontWeightToStyle(weight) {
  const w = parseInt(weight) || 400;
  if (w <= 100) return "Thin";
  if (w <= 200) return "ExtraLight";
  if (w <= 300) return "Light";
  if (w <= 400) return "Regular";
  if (w <= 500) return "Medium";
  if (w <= 600) return "SemiBold";
  if (w <= 700) return "Bold";
  if (w <= 800) return "ExtraBold";
  return "Black";
}

// ── Extract font family from CSS value ─────────────────────────────────────
function extractFontFamily(val) {
  if (!val) return "Inter";
  // Take the first font family, strip quotes
  const first = val.split(",")[0].trim().replace(/['"]/g, "");
  // Map common system fonts to Inter
  const systemFonts = ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif", "serif", "monospace", "Helvetica Neue", "Helvetica", "Arial"];
  if (systemFonts.includes(first)) return "Inter";
  return first;
}

// ── Try loading a font, fallback to Inter Regular ──────────────────────────
async function tryLoadFont(family, style) {
  try {
    await figma.loadFontAsync({ family, style });
    return { family, style };
  } catch(e) {
    // Try with "Regular" if the style didn't work
    if (style !== "Regular") {
      try {
        await figma.loadFontAsync({ family, style: "Regular" });
        return { family, style: "Regular" };
      } catch(e2) {}
    }
    // Fallback to Inter
    try {
      await figma.loadFontAsync({ family: "Inter", style: style });
      return { family: "Inter", style };
    } catch(e3) {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      return { family: "Inter", style: "Regular" };
    }
  }
}

// ── Count total nodes (for progress reporting) ─────────────────────────────
function countNodes(layer) {
  if (!layer) return 0;
  let count = 1;
  if (layer.children) {
    for (const child of layer.children) {
      count += countNodes(child);
    }
  }
  return count;
}

// ── MAIN: Recursively create Figma nodes from layer tree ────────────────────
let nodeCount = 0;

async function createNode(layer, parent, parentStyles) {
  if (!layer) return null;
  if (!parentStyles) parentStyles = {};
  nodeCount++;

  // ── TEXT_NODE: pure text child (inherits styles from parent) ────────────
  if (layer.type === "TEXT_NODE") {
    var inheritFamily = extractFontFamily(parentStyles["font-family"]);
    var inheritWeight = parentStyles["font-weight"] || "400";
    var inheritStyle = fontWeightToStyle(inheritWeight);
    const font = await tryLoadFont(inheritFamily, inheritStyle);
    const text = figma.createText();
    text.fontName = font;
    text.characters = layer.text || "";
    text.fontSize = px(parentStyles["font-size"]) || 14;

    // Inherit color from parent
    var inheritColor = colorToFill(parentStyles.color);
    if (inheritColor) {
      text.fills = [inheritColor];
    } else {
      text.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    }

    // Inherit line-height from parent
    var inheritLh = px(parentStyles["line-height"]);
    if (inheritLh > 0) text.lineHeight = { value: inheritLh, unit: "PIXELS" };

    // Inherit letter-spacing from parent
    var inheritLs = px(parentStyles["letter-spacing"]);
    if (inheritLs !== 0) text.letterSpacing = { value: inheritLs, unit: "PIXELS" };

    text.textAutoResize = "WIDTH_AND_HEIGHT";
    parent.appendChild(text);
    return text;
  }

  // ── SVG: use createNodeFromSvg with proper sizing ───────────────────────
  if (layer.type === "SVG") {
    try {
      var svgNode = figma.createNodeFromSvg(layer.svg);
      svgNode.name = "SVG";

      // Determine target size from SVG attributes and inline styles
      var svgStyles = layer.styles || {};
      var attrH = 0, attrW = 0, vbW = 0, vbH = 0;

      // Read height/width attributes from the SVG string
      var hAttr = layer.svg.match(/\bheight=["']?([\d.]+)/);
      var wAttr = layer.svg.match(/\bwidth=["']?([\d.]+)/);
      var vbAttr = layer.svg.match(/viewBox=["'](\S+)\s+(\S+)\s+(\S+)\s+(\S+)["']/);
      if (hAttr) attrH = parseFloat(hAttr[1]);
      if (wAttr) attrW = parseFloat(wAttr[1]);
      if (vbAttr) { vbW = parseFloat(vbAttr[3]); vbH = parseFloat(vbAttr[4]); }

      // CSS styles override attributes
      var cssH = px(svgStyles.height) || px(svgStyles["block-size"]);
      var cssW = px(svgStyles.width) || px(svgStyles["inline-size"]);

      var targetH = cssH || attrH || vbH || 24;
      var targetW = cssW || attrW;

      // If no explicit width, compute from viewBox aspect ratio
      if (!targetW && vbW && vbH && targetH) {
        targetW = targetH * (vbW / vbH);
      }
      if (!targetW) targetW = targetH; // fallback square

      if (targetW > 0 && targetH > 0) {
        svgNode.resize(targetW, targetH);
      }

      parent.appendChild(svgNode);
      return svgNode;
    } catch(e) {
      return null;
    }
  }

  // ── ELEMENT: create frame/rectangle/text ───────────────────────────────
  const s = layer.styles || {};

  // Skip absolutely/fixed positioned elements (invisible hover overlays, etc.)
  if (s.position === "absolute" || s.position === "fixed") {
    return null;
  }

  // Determine if this element is an empty spacer (no text, no children, no background)
  var hasBgColor = s["background-color"] && s["background-color"] !== "rgba(0, 0, 0, 0)" && s["background-color"] !== "transparent";
  var hasText = layer.text && layer.text.length > 0;
  var hasKids = layer.children && layer.children.length > 0;
  var isSpacer = !hasText && !hasKids && !hasBgColor;

  const w = Math.max(px(s.width) || px(s["inline-size"]) || px(s["min-width"]) || (isSpacer ? 1 : 100), 1);
  const h = Math.max(px(s.height) || px(s["block-size"]) || px(s["min-height"]) || (isSpacer ? 1 : 40), 1);

  // Determine if this is a text-only element
  const isTextOnly = layer.text && layer.children.length === 0;
  const hasChildren = layer.children && layer.children.length > 0;

  // ── Transparent wrapper bypass ──────────────────────────────────────────
  // When a display:block element has width:100%, no background, no border,
  // and exactly one child, skip creating a frame and pass through to parent.
  // This prevents unnecessary vertical wrappers from breaking horizontal flow.
  var display = s.display || "block";
  var childW = s.width || s["inline-size"] || "";
  var childH2 = s.height || s["block-size"] || "";
  var isBlock = display === "block" || display === "list-item";
  var isPassthrough = isBlock
    && isPercent100(childW)
    && !hasBgColor
    && !(s["border-width"] && px(s["border-width"]) > 0 && s["border-style"] !== "none")
    && !isTextOnly
    && hasChildren
    && layer.children.length === 1;

  if (isPassthrough) {
    return await createNode(layer.children[0], parent, s);
  }

  if (isTextOnly) {
    // ── Text element ──────────────────────────────────────────────────────
    const family = extractFontFamily(s["font-family"]);
    const weight = s["font-weight"] || "400";
    const fontStyle = fontWeightToStyle(weight);
    const font = await tryLoadFont(family, fontStyle);

    const text = figma.createText();
    text.fontName = font;
    text.characters = layer.text;
    text.fontSize = px(s["font-size"]) || 14;

    // Text color
    const textColor = colorToFill(s.color);
    if (textColor) text.fills = [textColor];

    // Text alignment
    const ta = s["text-align"];
    if (ta === "center") text.textAlignHorizontal = "CENTER";
    else if (ta === "right") text.textAlignHorizontal = "RIGHT";
    else text.textAlignHorizontal = "LEFT";

    // Line height
    const lh = px(s["line-height"]);
    if (lh > 0) text.lineHeight = { value: lh, unit: "PIXELS" };

    // Letter spacing
    const ls = px(s["letter-spacing"]);
    if (ls !== 0) text.letterSpacing = { value: ls, unit: "PIXELS" };

    // Text decoration
    var textDec = s["text-decoration"] || "";
    if (textDec.indexOf("underline") >= 0) text.textDecoration = "UNDERLINE";
    if (textDec.indexOf("line-through") >= 0) text.textDecoration = "STRIKETHROUGH";

    // Text transform
    if (s["text-transform"] === "uppercase") text.textCase = "UPPER";
    else if (s["text-transform"] === "lowercase") text.textCase = "LOWER";
    else if (s["text-transform"] === "capitalize") text.textCase = "TITLE";

    text.textAutoResize = "WIDTH_AND_HEIGHT";

    // Wrap text in a frame if it has background, border, padding, or explicit height
    const hasBg = s["background-color"] && s["background-color"] !== "rgba(0, 0, 0, 0)" && s["background-color"] !== "transparent";
    const hasBorder = s["border-width"] && px(s["border-width"]) > 0 && s["border-style"] !== "none";
    var hasPadding = px(s["padding-left"]) > 0 || px(s["padding-right"]) > 0 || px(s["padding-top"]) > 0 || px(s["padding-bottom"]) > 0
      || px(s["padding-inline-start"]) > 0 || px(s["padding-inline-end"]) > 0;
    var hasExplicitH = px(s.height) > 0 || px(s["block-size"]) > 0;

    if (hasBg || hasBorder || hasPadding || hasExplicitH) {
      const frame = figma.createFrame();
      frame.name = layer.tag || "container";
      frame.resize(w, h);
      frame.layoutMode = "HORIZONTAL";
      frame.primaryAxisAlignItems = mapAlignment(s["justify-content"] || s["text-align"]);
      frame.counterAxisAlignItems = mapAlignment(s["align-items"] || "center");
      frame.paddingTop = px(s["padding-top"]) || px(s["padding-block-start"]);
      frame.paddingBottom = px(s["padding-bottom"]) || px(s["padding-block-end"]);
      frame.paddingLeft = px(s["padding-left"]) || px(s["padding-inline-start"]);
      frame.paddingRight = px(s["padding-right"]) || px(s["padding-inline-end"]);
      frame.primaryAxisSizingMode = "AUTO";
      frame.counterAxisSizingMode = "AUTO";

      // Background: solid color or gradient
      var bgFills2 = [];
      var bgSolid2 = colorToFill(s["background-color"]);
      if (bgSolid2) bgFills2.push(bgSolid2);
      var bgGrads2 = parseGradientFills(s["background-image"]);
      if (bgGrads2.length > 0) bgFills2 = bgGrads2;
      frame.fills = bgFills2;

      // Border radius
      const br = parseBorderRadius(s["border-radius"]);
      if (typeof br === "number") {
        frame.cornerRadius = br;
      } else if (Array.isArray(br)) {
        frame.topLeftRadius = br[0] || 0;
        frame.topRightRadius = br[1] || 0;
        frame.bottomRightRadius = br[2] || 0;
        frame.bottomLeftRadius = br[3] || 0;
      }

      // Border
      if (hasBorder) {
        const borderColor = colorToFill(s["border-color"]);
        if (borderColor) {
          frame.strokes = [borderColor];
          frame.strokeWeight = px(s["border-width"]) || 1;
          frame.strokeAlign = "INSIDE";
        }
      }

      // Box shadow
      const shadows = parseBoxShadow(s["box-shadow"]);
      if (shadows.length) frame.effects = shadows;

      // Opacity
      if (s.opacity) frame.opacity = parseFloat(s.opacity);

      parent.appendChild(frame);
      frame.appendChild(text);
      return frame;
    }

    parent.appendChild(text);
    return text;
  }

  // ── Container element (frame) ───────────────────────────────────────────
  const frame = figma.createFrame();
  frame.name = layer.tag || "div";
  frame.resize(w, h);

  // Layout
  const layoutMode = getLayoutMode(s);
  if (layoutMode !== "NONE") {
    frame.layoutMode = layoutMode;
    frame.primaryAxisAlignItems = mapAlignment(
      layoutMode === "HORIZONTAL" ? s["justify-content"] : s["align-items"]
    );
    frame.counterAxisAlignItems = mapAlignment(
      layoutMode === "HORIZONTAL" ? s["align-items"] : s["justify-content"]
    );

    // Use direction-appropriate gap: column-gap for HORIZONTAL, row-gap for VERTICAL
    var gap;
    if (layoutMode === "HORIZONTAL") {
      gap = px(s.gap) || px(s["column-gap"]) || 0;
    } else {
      gap = px(s.gap) || px(s["row-gap"]) || 0;
    }
    if (gap > 0) frame.itemSpacing = gap;

    // Sizing: FIXED if explicit dimension exists, AUTO (hug) otherwise
    // For HORIZONTAL: primary axis = width, counter axis = height
    // For VERTICAL: primary axis = height, counter axis = width
    var explicitW = px(s.width) || px(s["inline-size"]);
    var explicitH = px(s.height) || px(s["block-size"]) || px(s["min-height"]);
    if (layoutMode === "HORIZONTAL") {
      frame.primaryAxisSizingMode = explicitW > 0 ? "FIXED" : "AUTO";
      frame.counterAxisSizingMode = explicitH > 0 ? "FIXED" : "AUTO";
    } else {
      frame.primaryAxisSizingMode = explicitH > 0 ? "FIXED" : "AUTO";
      frame.counterAxisSizingMode = explicitW > 0 ? "FIXED" : "AUTO";
    }
  }

  // Padding (check both standard and logical properties)
  frame.paddingTop = px(s["padding-top"]) || px(s["padding-block-start"]);
  frame.paddingBottom = px(s["padding-bottom"]) || px(s["padding-block-end"]);
  frame.paddingLeft = px(s["padding-left"]) || px(s["padding-inline-start"]);
  frame.paddingRight = px(s["padding-right"]) || px(s["padding-inline-end"]);

  // Max width / max height constraints
  var maxW = px(s["max-width"] || s["max-inline-size"]);
  if (maxW > 0) frame.maxWidth = maxW;
  var maxH = px(s["max-height"] || s["max-block-size"]);
  if (maxH > 0) frame.maxHeight = maxH;

  // Background: solid color or gradient
  var bgFills = [];
  var bgSolid = colorToFill(s["background-color"]);
  if (bgSolid) bgFills.push(bgSolid);
  var bgGradients = parseGradientFills(s["background-image"]);
  if (bgGradients.length > 0) bgFills = bgGradients;
  frame.fills = bgFills;

  // Border radius
  const br = parseBorderRadius(s["border-radius"]);
  if (typeof br === "number") {
    frame.cornerRadius = br;
  } else if (Array.isArray(br)) {
    frame.topLeftRadius = br[0] || 0;
    frame.topRightRadius = br[1] || 0;
    frame.bottomRightRadius = br[2] || 0;
    frame.bottomLeftRadius = br[3] || 0;
  }

  // Border
  const hasBorder = s["border-width"] && px(s["border-width"]) > 0 && s["border-style"] !== "none";
  if (hasBorder) {
    const borderColor = colorToFill(s["border-color"]);
    if (borderColor) {
      frame.strokes = [borderColor];
      frame.strokeWeight = px(s["border-width"]) || 1;
      frame.strokeAlign = "INSIDE";
    }
  }

  // Box shadow
  const shadows = parseBoxShadow(s["box-shadow"]);
  if (shadows.length) frame.effects = shadows;

  // Opacity
  if (s.opacity) frame.opacity = parseFloat(s.opacity);

  // Clip content (overflow hidden)
  if (s.overflow === "hidden") frame.clipsContent = true;

  parent.appendChild(frame);

  // ── Recurse children ──────────────────────────────────────────────────
  // Track child layers alongside Figma nodes for post-processing
  var childPairs = [];
  if (hasChildren) {
    for (var ci = 0; ci < layer.children.length; ci++) {
      var childLayer = layer.children[ci];
      var childNode = await createNode(childLayer, frame, s);
      if (childNode) {
        childPairs.push({ layer: childLayer, node: childNode });
      }
    }
  }

  // After appending children, set sizing where appropriate
  if (layoutMode !== "NONE") {
    for (var pi = 0; pi < childPairs.length; pi++) {
      var pair = childPairs[pi];
      var childFigma = pair.node;
      var childStyles = (pair.layer && pair.layer.styles) ? pair.layer.styles : {};

      if (!("layoutSizingHorizontal" in childFigma)) continue;

      var canHug = childFigma.type === "TEXT" ||
        (childFigma.type === "FRAME" && childFigma.layoutMode && childFigma.layoutMode !== "NONE");

      var childFlexGrow = parseFloat(childStyles["flex-grow"]) || 0;
      var childWidth = childStyles.width || childStyles["inline-size"] || "";
      var childHeight = childStyles.height || childStyles["block-size"] || "";

      // Detect spacer: no text, no children, no background — pure flex filler
      var childLayerData = pair.layer || {};
      var childHasContent = (childLayerData.text && childLayerData.text.length > 0)
        || (childLayerData.children && childLayerData.children.length > 0);
      var childHasBg = childStyles["background-color"]
        && childStyles["background-color"] !== "rgba(0, 0, 0, 0)"
        && childStyles["background-color"] !== "transparent";
      var isChildSpacer = !childHasContent && !childHasBg && childFlexGrow >= 1;

      // flex-grow >= 1: FILL along primary axis
      if (childFlexGrow >= 1) {
        if (layoutMode === "HORIZONTAL") {
          childFigma.layoutSizingHorizontal = "FILL";
        } else {
          childFigma.layoutSizingVertical = "FILL";
        }
      }

      // Spacer divs: also FILL on counter axis so they don't impose size
      if (isChildSpacer) {
        if (layoutMode === "HORIZONTAL") {
          childFigma.layoutSizingVertical = "FILL";
        } else {
          childFigma.layoutSizingHorizontal = "FILL";
        }
      }

      // width: 100% → FILL horizontally (max-width will constrain if set)
      if (isPercent100(childWidth)) {
        childFigma.layoutSizingHorizontal = "FILL";
      }
      // height: 100% → FILL vertically (any parent direction)
      if (isPercent100(childHeight)) {
        childFigma.layoutSizingVertical = "FILL";
      }

      // HUG only on text nodes or auto-layout frames, otherwise FIXED
      // (but skip if already set to FILL above)
      if (childFigma.layoutSizingHorizontal !== "FILL") {
        if (childFigma.type === "TEXT") {
          childFigma.layoutSizingHorizontal = "HUG";
        } else if (!canHug) {
          childFigma.layoutSizingHorizontal = "FIXED";
        }
      }
    }
  }

  return frame;
}

// ── Handle messages from UI ─────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {
  if (msg.type === "import") {
    try {
      nodeCount = 0;
      const total = countNodes(msg.layers);
      console.log("Importing", total, "nodes...");

      const rootNode = await createNode(msg.layers, figma.currentPage);

      if (rootNode) {
        // Position at center of viewport
        const vp = figma.viewport.center;
        rootNode.x = Math.round(vp.x - (rootNode.width || 0) / 2);
        rootNode.y = Math.round(vp.y - (rootNode.height || 0) / 2);

        // Select and focus
        figma.currentPage.selection = [rootNode];
        figma.viewport.scrollAndZoomIntoView([rootNode]);
      }

      figma.ui.postMessage({ type: "done", count: nodeCount });
    } catch(err) {
      console.error("Import error:", err);
      figma.ui.postMessage({ type: "error", error: String(err) });
    }
  }
};
