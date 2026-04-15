"use strict";

// ============================================================================
// UI2Code Snapshot Import — Figma Plugin (v2)
// Receives parsed HTML layer tree from ui.html, creates native Figma nodes
// with proper sizing, layout, fonts, and child alignment
// ============================================================================

figma.showUI(__html__, { width: 420, height: 480, themeColors: true });

// ── Color helpers ───────────────────────────────────────────────────────────
function parseColor(str) {
  if (!str || str === "transparent" || str === "rgba(0, 0, 0, 0)") return null;
  str = str.trim();
  if (str.startsWith("#")) {
    var hex = str.slice(1);
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length === 8) {
      return { r: parseInt(hex.slice(0,2),16)/255, g: parseInt(hex.slice(2,4),16)/255, b: parseInt(hex.slice(4,6),16)/255, a: parseInt(hex.slice(6,8),16)/255 };
    }
    return { r: parseInt(hex.slice(0,2),16)/255, g: parseInt(hex.slice(2,4),16)/255, b: parseInt(hex.slice(4,6),16)/255, a: 1 };
  }
  var m = str.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
  if (m) {
    return { r: parseFloat(m[1])/255, g: parseFloat(m[2])/255, b: parseFloat(m[3])/255, a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
  }
  return null;
}

function colorToFill(colorStr) {
  var c = parseColor(colorStr);
  if (!c) return null;
  return { type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
}

function px(val) {
  if (!val || val === "auto" || val === "none" || val === "normal") return 0;
  return parseFloat(val) || 0;
}

function isExplicitPx(val) {
  return val && val !== "auto" && val !== "none" && parseFloat(val) > 0;
}

// ── Parse border-radius ─────────────────────────────────────────────────────
function parseBorderRadius(val) {
  if (!val) return 0;
  var parts = val.split(/\s+/).map(function(v) { return parseFloat(v) || 0; });
  if (parts.length === 1) return parts[0];
  return parts;
}

// ── Parse box-shadow ────────────────────────────────────────────────────────
function parseBoxShadow(val) {
  if (!val || val === "none") return [];
  var effects = [];
  var re = /(inset\s+)?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+([\d.]+)px)?\s+(rgba?\([^)]+\)|#[a-fA-F0-9]+)/g;
  var match;
  while ((match = re.exec(val)) !== null) {
    var c = parseColor(match[6]);
    if (c) {
      effects.push({
        type: match[1] ? "INNER_SHADOW" : "DROP_SHADOW",
        color: { r: c.r, g: c.g, b: c.b, a: c.a },
        offset: { x: parseFloat(match[2]), y: parseFloat(match[3]) },
        radius: parseFloat(match[4]),
        spread: match[5] ? parseFloat(match[5]) : 0,
        visible: true, blendMode: "NORMAL",
      });
    }
  }
  return effects;
}

// ── Layout helpers ──────────────────────────────────────────────────────────
function getLayoutMode(s) {
  var display = s.display;
  if (display === "flex" || display === "inline-flex") {
    var dir = s["flex-direction"] || "row";
    return dir.indexOf("column") >= 0 ? "VERTICAL" : "HORIZONTAL";
  }
  if (display === "block" || display === "list-item" || display === "grid" || !display) {
    return "VERTICAL";
  }
  if (display === "inline" || display === "inline-block" || display === "contents") {
    return "NONE";
  }
  return "VERTICAL";
}

function mapAlignment(val, isCounterAxis) {
  if (!val) return "MIN";
  if (val === "center") return "CENTER";
  if (val === "flex-end" || val === "end") return "MAX";
  if (val === "space-between") return isCounterAxis ? "MIN" : "SPACE_BETWEEN";
  return "MIN";
}

// ── Font helpers ────────────────────────────────────────────────────────────
function fontWeightToStyle(weight) {
  var w = parseInt(weight) || 400;
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

function extractFontFamily(val) {
  if (!val) return "Inter";
  var first = val.split(",")[0].trim().replace(/['"]/g, "");
  // Strip " Variable" suffix (common in captured styles)
  first = first.replace(/ Variable$/, "");
  var systemFonts = ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif", "serif", "monospace", "Helvetica Neue", "Helvetica", "Arial"];
  if (systemFonts.indexOf(first) >= 0) return "Inter";
  return first;
}

async function tryLoadFont(family, style) {
  try {
    await figma.loadFontAsync({ family: family, style: style });
    return { family: family, style: style };
  } catch(e) {
    if (style !== "Regular") {
      try { await figma.loadFontAsync({ family: family, style: "Regular" }); return { family: family, style: "Regular" }; } catch(e2) {}
    }
    try { await figma.loadFontAsync({ family: "Inter", style: style }); return { family: "Inter", style: style }; } catch(e3) {}
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    return { family: "Inter", style: "Regular" };
  }
}

// ── Visibility check ────────────────────────────────────────────────────────
function isVisible(s) {
  if (s.display === "none") return false;
  if (s.visibility === "hidden") return false;
  if (s.opacity === "0") return false;
  return true;
}

function hasVisualContent(layer) {
  if (layer.text) return true;
  if (layer.children && layer.children.length > 0) return true;
  var s = layer.styles || {};
  if (s["background-color"] && s["background-color"] !== "rgba(0, 0, 0, 0)" && s["background-color"] !== "transparent") return true;
  if (s["border-width"] && px(s["border-width"]) > 0) return true;
  if (isExplicitPx(s.width) || isExplicitPx(s.height)) return true;
  return false;
}

// ── Apply common frame styling ──────────────────────────────────────────────
function applyFrameStyles(frame, s) {
  // Background
  var bg = colorToFill(s["background-color"] || s.background);
  frame.fills = bg ? [bg] : [];

  // Border radius
  var br = parseBorderRadius(s["border-radius"]);
  if (typeof br === "number") {
    frame.cornerRadius = br;
  } else if (Array.isArray(br)) {
    frame.topLeftRadius = br[0] || 0;
    frame.topRightRadius = br[1] || 0;
    frame.bottomRightRadius = br[2] || 0;
    frame.bottomLeftRadius = br[3] || 0;
  }

  // Border
  var bw = px(s["border-width"] || s["border-top-width"]);
  if (bw > 0 && s["border-style"] !== "none") {
    var borderColor = colorToFill(s["border-color"] || s["border-top-color"]);
    if (borderColor) {
      frame.strokes = [borderColor];
      frame.strokeWeight = bw;
      frame.strokeAlign = "INSIDE";
    }
  }

  // Box shadow
  var shadows = parseBoxShadow(s["box-shadow"]);
  if (shadows.length) frame.effects = shadows;

  // Opacity
  if (s.opacity && s.opacity !== "1") frame.opacity = parseFloat(s.opacity);

  // Clip content
  if (s.overflow === "hidden" || s["overflow-x"] === "hidden" || s["overflow-y"] === "hidden") {
    frame.clipsContent = true;
  }
}

// ── Count nodes ─────────────────────────────────────────────────────────────
function countNodes(layer) {
  if (!layer) return 0;
  var count = 1;
  if (layer.children) {
    for (var i = 0; i < layer.children.length; i++) {
      count += countNodes(layer.children[i]);
    }
  }
  return count;
}

// ── MAIN: Recursively create Figma nodes ────────────────────────────────────
var nodeCount = 0;

async function createNode(layer, parent, parentStyles) {
  if (!layer) return null;

  // ── TEXT_NODE: inherit styles from parent ────────────────────────────────
  if (layer.type === "TEXT_NODE") {
    var ps = parentStyles || {};
    var family = extractFontFamily(ps["font-family"]);
    var weight = ps["font-weight"] || "400";
    var fStyle = fontWeightToStyle(weight);
    var font = await tryLoadFont(family, fStyle);

    var text = figma.createText();
    text.fontName = font;
    text.characters = layer.text || " ";
    text.fontSize = px(ps["font-size"]) || 14;

    var textColor = colorToFill(ps.color);
    text.fills = textColor ? [textColor] : [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

    var lh = px(ps["line-height"]);
    if (lh > 0) text.lineHeight = { value: lh, unit: "PIXELS" };

    text.textAutoResize = "WIDTH_AND_HEIGHT";
    parent.appendChild(text);
    nodeCount++;
    return text;
  }

  // ── SVG: use createNodeFromSvg with sizing ──────────────────────────────
  if (layer.type === "SVG") {
    try {
      var svgNode = figma.createNodeFromSvg(layer.svg);
      svgNode.name = "SVG";
      // Resize based on SVG attributes
      var wMatch = layer.svg.match(/\bwidth=["']?([\d.]+)/);
      var hMatch = layer.svg.match(/\bheight=["']?([\d.]+)/);
      if (wMatch && hMatch) {
        var svgW = parseFloat(wMatch[1]);
        var svgH = parseFloat(hMatch[1]);
        if (svgW > 0 && svgH > 0) svgNode.resize(svgW, svgH);
      }
      parent.appendChild(svgNode);
      nodeCount++;
      return svgNode;
    } catch(e) {
      return null;
    }
  }

  // ── ELEMENT ─────────────────────────────────────────────────────────────
  var s = layer.styles || {};

  // Skip invisible or empty elements
  if (!isVisible(s)) return null;
  if (!hasVisualContent(layer)) return null;

  // Resolve dimensions
  var explicitW = px(s.width) || px(s["inline-size"]);
  var explicitH = px(s.height) || px(s["block-size"]);
  var minW = px(s["min-width"]);
  var minH = px(s["min-height"]);
  var maxW = px(s["max-width"] || s["max-inline-size"]);
  var w = explicitW || minW || 100;
  var h = explicitH || minH || 24;
  if (w < 1) w = 100;
  if (h < 1) h = 24;

  var isTextOnly = layer.text && (!layer.children || layer.children.length === 0);
  var hasChildren = layer.children && layer.children.length > 0;

  // ── Text-only element ─────────────────────────────────────────────────
  if (isTextOnly) {
    var family2 = extractFontFamily(s["font-family"]);
    var weight2 = s["font-weight"] || "400";
    var fStyle2 = fontWeightToStyle(weight2);
    var font2 = await tryLoadFont(family2, fStyle2);

    var text2 = figma.createText();
    text2.fontName = font2;
    text2.characters = layer.text;
    text2.fontSize = px(s["font-size"]) || 14;

    var textColor2 = colorToFill(s.color);
    if (textColor2) text2.fills = [textColor2];

    var ta = s["text-align"];
    if (ta === "center") text2.textAlignHorizontal = "CENTER";
    else if (ta === "right") text2.textAlignHorizontal = "RIGHT";

    var lh2 = px(s["line-height"]);
    if (lh2 > 0) text2.lineHeight = { value: lh2, unit: "PIXELS" };

    var ls = px(s["letter-spacing"]);
    if (ls !== 0) text2.letterSpacing = { value: ls, unit: "PIXELS" };

    var textDec = s["text-decoration"] || "";
    if (textDec.indexOf("underline") >= 0) text2.textDecoration = "UNDERLINE";
    if (textDec.indexOf("line-through") >= 0) text2.textDecoration = "STRIKETHROUGH";

    text2.textAutoResize = "WIDTH_AND_HEIGHT";

    // Wrap in frame if has background/border
    var hasBg = s["background-color"] && s["background-color"] !== "rgba(0, 0, 0, 0)" && s["background-color"] !== "transparent";
    var hasBorder = px(s["border-width"]) > 0 && s["border-style"] !== "none";

    if (hasBg || hasBorder) {
      var frame = figma.createFrame();
      frame.name = layer.tag || "text-container";
      frame.layoutMode = "HORIZONTAL";
      frame.primaryAxisAlignItems = mapAlignment(s["justify-content"] || s["text-align"]);
      frame.counterAxisAlignItems = "CENTER";
      frame.paddingTop = px(s["padding-top"]);
      frame.paddingBottom = px(s["padding-bottom"]);
      frame.paddingLeft = px(s["padding-left"]);
      frame.paddingRight = px(s["padding-right"]);

      // Sizing: use explicit if available, otherwise hug
      if (isExplicitPx(s.width)) {
        frame.resize(explicitW, h);
        frame.primaryAxisSizingMode = "FIXED";
      } else {
        frame.primaryAxisSizingMode = "AUTO";
      }
      frame.counterAxisSizingMode = "AUTO";
      if (minH > 0) frame.minHeight = minH;

      applyFrameStyles(frame, s);
      parent.appendChild(frame);
      frame.appendChild(text2);
      nodeCount += 2;
      return frame;
    }

    parent.appendChild(text2);
    nodeCount++;
    return text2;
  }

  // ── Container element (frame with children) ───────────────────────────
  var frame2 = figma.createFrame();
  frame2.name = layer.tag || "div";

  // Layout mode
  var layoutMode = getLayoutMode(s);
  if (layoutMode !== "NONE") {
    frame2.layoutMode = layoutMode;
    frame2.primaryAxisAlignItems = mapAlignment(
      layoutMode === "HORIZONTAL" ? s["justify-content"] : s["align-items"],
      false
    );
    frame2.counterAxisAlignItems = mapAlignment(
      layoutMode === "HORIZONTAL" ? s["align-items"] : s["justify-content"],
      true
    );

    // Gap
    var gap = px(s.gap);
    if (!gap) {
      gap = layoutMode === "HORIZONTAL" ? (px(s["column-gap"]) || px(s["row-gap"])) : (px(s["row-gap"]) || px(s["column-gap"]));
    }
    if (gap > 0) frame2.itemSpacing = gap;

    // Sizing: FIXED if explicit dimension, AUTO (hug) otherwise
    var primaryIsWidth = layoutMode === "HORIZONTAL";
    var primaryExplicit = primaryIsWidth ? explicitW : explicitH;
    var counterExplicit = primaryIsWidth ? explicitH : explicitW;

    frame2.primaryAxisSizingMode = primaryExplicit > 0 ? "FIXED" : "AUTO";
    frame2.counterAxisSizingMode = counterExplicit > 0 ? "FIXED" : "AUTO";
  }

  // Resize to explicit or fallback dimensions
  frame2.resize(Math.max(w, 1), Math.max(h, 1));

  // Min/max dimensions
  if (minW > 0) frame2.minWidth = minW;
  if (minH > 0) frame2.minHeight = minH;
  if (maxW > 0) frame2.maxWidth = maxW;

  // Padding
  frame2.paddingTop = px(s["padding-top"]);
  frame2.paddingBottom = px(s["padding-bottom"]);
  frame2.paddingLeft = px(s["padding-left"]) || px(s["padding-inline-start"]);
  frame2.paddingRight = px(s["padding-right"]) || px(s["padding-inline-end"]);

  // Apply visual styles
  applyFrameStyles(frame2, s);

  parent.appendChild(frame2);
  nodeCount++;

  // ── Recurse children ────────────────────────────────────────────────────
  var childResults = [];
  if (hasChildren) {
    for (var i = 0; i < layer.children.length; i++) {
      var child = layer.children[i];
      var childNode = await createNode(child, frame2, s);
      childResults.push({ layer: child, node: childNode });
    }
  }

  // ── Post-append: set child sizing based on flex properties ────────────
  if (layoutMode !== "NONE") {
    var parentAlignItems = s["align-items"] || "stretch";
    var isStretch = parentAlignItems === "stretch" || parentAlignItems === "normal" || !s["align-items"];

    for (var j = 0; j < childResults.length; j++) {
      var cr = childResults[j];
      if (!cr.node || !("layoutSizingHorizontal" in cr.node)) continue;

      var cs = (cr.layer && cr.layer.styles) ? cr.layer.styles : {};
      var flexGrow = parseFloat(cs["flex-grow"]) || 0;
      var childExplicitW = isExplicitPx(cs.width) ? px(cs.width) : 0;
      var childExplicitH = isExplicitPx(cs.height) ? px(cs.height) : 0;
      var flexBasis = px(cs["flex-basis"]);

      if (layoutMode === "HORIZONTAL") {
        // Primary axis = horizontal
        if (flexGrow >= 1 || (flexBasis === 0 && flexGrow >= 1)) {
          cr.node.layoutSizingHorizontal = "FILL";
        } else if (childExplicitW > 0) {
          cr.node.layoutSizingHorizontal = "FIXED";
        } else {
          cr.node.layoutSizingHorizontal = "HUG";
        }
        // Counter axis = vertical
        if (childExplicitH > 0 && cs.height !== "auto") {
          cr.node.layoutSizingVertical = "FIXED";
        } else if (isStretch && cs["align-self"] !== "flex-start" && cs["align-self"] !== "center" && cs["align-self"] !== "flex-end") {
          cr.node.layoutSizingVertical = "FILL";
        } else {
          cr.node.layoutSizingVertical = "HUG";
        }
      } else {
        // Primary axis = vertical
        if (flexGrow >= 1) {
          cr.node.layoutSizingVertical = "FILL";
        } else if (childExplicitH > 0 && cs.height !== "auto") {
          cr.node.layoutSizingVertical = "FIXED";
        } else {
          cr.node.layoutSizingVertical = "HUG";
        }
        // Counter axis = horizontal
        if (childExplicitW > 0 && cs.width !== "auto" && cs.width !== "100%") {
          cr.node.layoutSizingHorizontal = "FIXED";
        } else if (isStretch) {
          cr.node.layoutSizingHorizontal = "FILL";
        } else {
          cr.node.layoutSizingHorizontal = "HUG";
        }
      }
    }
  }

  return frame2;
}

// ── Handle messages from UI ─────────────────────────────────────────────────
figma.ui.onmessage = async function(msg) {
  if (msg.type === "import") {
    try {
      nodeCount = 0;
      var total = countNodes(msg.layers);
      console.log("Importing", total, "nodes...");

      var rootNode = await createNode(msg.layers, figma.currentPage, {});

      if (rootNode) {
        var vp = figma.viewport.center;
        rootNode.x = Math.round(vp.x - (rootNode.width || 0) / 2);
        rootNode.y = Math.round(vp.y - (rootNode.height || 0) / 2);
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
