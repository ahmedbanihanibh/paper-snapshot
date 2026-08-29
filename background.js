"use strict";

// ============================================================================
// CLIPBOARD — Direct port from Paper Snapshot: copy-to-clipboard.ts
// Modified: copies as both text/plain and text/html (no x-paper-html wrapper)
// ============================================================================
async function copyToClipboard(text) {
  function waitForFocus() {
    if (document.hasFocus()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.addEventListener("focus", () => resolve(), { once: true });
    });
  }

  await waitForFocus();
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([text], { type: "text/plain" }),
      "text/html": new Blob([text], { type: "text/html" }),
    }),
  ]);
}

// Copy for Paper app — wraps HTML in <x-paper-html> so Paper recognizes the paste
async function copyToClipboardForPaper(html) {
  function waitForFocus() {
    if (document.hasFocus()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.addEventListener("focus", () => resolve(), { once: true });
    });
  }

  await waitForFocus();
  const paperHtml = `<x-paper-html>${html}</x-paper-html>`;
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([html], { type: "text/plain" }),
      "text/html": new Blob([paperHtml], { type: "text/html" }),
    }),
  ]);
}

// Copy for OpenPencil — wraps HTML in <x-openpencil-html> so OpenPencil recognizes the paste
async function copyToClipboardForOpenPencil(html) {
  function waitForFocus() {
    if (document.hasFocus()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.addEventListener("focus", () => resolve(), { once: true });
    });
  }

  await waitForFocus();
  const openPencilHtml = `<x-openpencil-html>${html}</x-openpencil-html>`;
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([html], { type: "text/plain" }),
      "text/html": new Blob([openPencilHtml], { type: "text/html" }),
    }),
  ]);
}

// ============================================================================
// FIGMA — SVG foreignObject approach (best without proprietary binary format)
// Figma accepts SVG paste natively via DataTransfer's image/svg+xml
// ============================================================================
async function copyToClipboardForFigma(rawHtml) {
  function waitForFocus() {
    if (document.hasFocus()) return Promise.resolve();
    return new Promise(resolve => window.addEventListener("focus", resolve, { once: true }));
  }
  await waitForFocus();

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="600">
  <foreignObject width="800" height="600" requiredExtensions="http://www.w3.org/1999/xhtml">
    <body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;background:transparent">
      ${rawHtml}
    </body>
  </foreignObject>
</svg>`;

  // Use execCommand copy event so we can set image/svg+xml on DataTransfer
  // (navigator.clipboard.write rejects image/svg+xml in most browsers)
  return new Promise((resolve) => {
    const handler = (e) => {
      e.preventDefault();
      e.clipboardData.setData("text/plain", rawHtml);
      e.clipboardData.setData("text/html", rawHtml);
      e.clipboardData.setData("image/svg+xml", svgContent);
      document.removeEventListener("copy", handler, true);
      resolve();
    };
    document.addEventListener("copy", handler, true);
    document.execCommand("copy");
  });
}

// ============================================================================
// JITTER — Clipboard format: text/plain with JSON
// Internal format: { layers: [{ id, item: {type:"artboard",...}, children }], operations: [] }
// Nested tree with artboard root → operationsTree + layersTree → layerGrp/text/rect
// ============================================================================
async function copyToClipboardForJitter(rawHtml) {
  function waitForFocus() {
    if (document.hasFocus()) return Promise.resolve();
    return new Promise(resolve => window.addEventListener("focus", resolve, { once: true }));
  }
  await waitForFocus();

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return;

  // Nanoid-style random ID generator (21 chars)
  function nanoid() {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    var id = "";
    var bytes = crypto.getRandomValues(new Uint8Array(21));
    for (var i = 0; i < 21; i++) id += chars[bytes[i] % 64];
    return id;
  }

  function parseStyleStr(str) {
    var s = {};
    if (!str) return s;
    str.split(";").forEach(function(p) {
      var i = p.indexOf(":"); if (i < 0) return;
      var k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
      if (k) s[k] = v;
    });
    return s;
  }

  function px(v) {
    if (!v) return 0;
    if (typeof v === "string" && v.indexOf("%") >= 0) return 0;
    return parseFloat(v) || 0;
  }

  function rgbToHex(c) {
    if (!c) return "#000000";
    var m = c.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (m) return "#" + ((1 << 24) + (Math.round(+m[1]) << 16) + (Math.round(+m[2]) << 8) + Math.round(+m[3])).toString(16).slice(1);
    if (c.startsWith("#")) return c;
    return "#000000";
  }

  function fontName(ff) {
    if (!ff) return "Inter";
    var f = ff.split(",")[0].trim().replace(/['"]/g, "").replace(/ Variable$/i, "");
    if (["-apple-system","BlinkMacSystemFont","system-ui","Segoe UI","SF Pro Display"].indexOf(f) >= 0) return "Inter";
    return f;
  }

  function fontStyleName(w) {
    var n = parseInt(w) || 400;
    if (n <= 300) return "light";
    if (n <= 400) return "regular";
    if (n <= 500) return "medium";
    if (n <= 600) return "semibold";
    if (n <= 700) return "bold";
    return "extrabold";
  }

  // Build a text layer item
  function makeText(text, s, x, y, parentW) {
    var fs = px(s["font-size"]) || 16;
    var fw = parseInt(s["font-weight"]) || 400;
    var lhRaw = s["line-height"];
    var lh = 150;
    if (lhRaw) { var lv = parseFloat(lhRaw); if (lv > 0) { lh = (lhRaw.indexOf("px") < 0 && lv < 10) ? lv * 100 : (lv / fs) * 100; } }
    var ls = px(s["letter-spacing"]) || 0;
    var maxW = px(s["max-width"] || s["max-inline-size"]);
    var tw = maxW > 0 ? maxW : parentW;
    // Estimate text height
    var charsPerLine = Math.max(Math.floor(tw / (fs * 0.5)), 1);
    var numLines = Math.ceil(text.length / charsPerLine);
    var textH = Math.max(numLines * fs * (lh / 100), fs * 1.5);
    var co = []; for (var oi = 0; oi < text.length; oi++) co.push(0);
    var opacity = s.opacity ? Math.round(parseFloat(s.opacity) * 100) : 100;

    return {
      id: nanoid(),
      item: {
        type: "text", text: text,
        font: { type: "googlefont", name: fontName(s["font-family"]), weight: fw, fontStyle: fontStyleName(fw) },
        fontSize: fs, lineHeight: Math.round(lh), letterSpacing: Math.round(ls * 10) / 10,
        textAlign: s["text-align"] || "left", verticalAlign: "top", autoResize: "height",
        x: x, y: y, width: tw, height: Math.round(textH),
        angle: 0, scale: 1, opacity: opacity,
        background: true, fillColor: rgbToHex(s.color),
        case: "normal", kerning: true, ligatures: true,
        strokeEnabled: false, shadowEnabled: false,
        characterStyleOverrides: co, styleOverrideTable: {}
      },
      _height: Math.round(textH) // estimated height for layout
    };
  }

  // Recursively flatten element tree into positioned Jitter layers
  // parentX/Y = absolute position of this element's content area (after padding)
  // parentW/H = content area dimensions
  function buildLayers(el, parentX, parentY, parentW, parentH) {
    if (!(el instanceof Element)) return [];
    var tag = el.tagName.toLowerCase();
    var s = parseStyleStr(el.getAttribute("style") || "");

    if (s.position === "absolute" || s.position === "fixed") return [];
    if (tag === "svg") return [];

    var padT = px(s["padding-top"]) || px(s["padding-block-start"]) || 0;
    var padB = px(s["padding-bottom"]) || px(s["padding-block-end"]) || 0;
    var padL = px(s["padding-left"]) || px(s["padding-inline-start"]) || 0;
    var padR = px(s["padding-right"]) || px(s["padding-inline-end"]) || 0;

    var w = px(s.width) || px(s["inline-size"]) || parentW;
    var h = px(s.height) || px(s["block-size"]) || px(s["min-height"]) || parentH;
    var contentW = w - padL - padR;
    var contentH = h - padT - padB;

    var display = s.display || "block";
    var flexDir = s["flex-direction"] || "row";
    var isColumn = display === "flex" && flexDir === "column";
    var gap = px(s.gap) || px(s["row-gap"]) || 0;

    // Check for inline text merge
    var merged = "", allInline = true;
    for (var ci = 0; ci < el.childNodes.length; ci++) {
      var ch = el.childNodes[ci];
      if (ch.nodeType === 3) { if (ch.textContent.trim()) merged += ch.textContent.trim(); }
      else if (ch.nodeType === 1) {
        var cs = parseStyleStr(ch.getAttribute("style") || "");
        var ct = ch.tagName.toLowerCase();
        var isInl = ["span","a","strong","em","b","i"].indexOf(ct) >= 0;
        var isBlk = ["block","flex","grid"].indexOf(cs.display || "") >= 0;
        if (isInl && !isBlk && ch.children.length === 0 && ch.textContent.trim()) { merged += ch.textContent.trim(); }
        else { allInline = false; break; }
      }
    }
    if (!allInline) merged = "";
    if (!merged && el.children.length === 0 && el.textContent.trim()) merged = el.textContent.trim();

    // If text-only, return a positioned text layer
    if (merged) {
      var tl = makeText(merged, s, parentX, parentY, contentW > 0 ? contentW : parentW);
      return [tl];
    }

    // Container: collect children with computed positions
    var layers = [];
    var curX = parentX + padL;
    var curY = parentY + padT;

    // First pass: build all children and compute sizes
    var childInfos = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType === 1) {
        var childTag = child.tagName.toLowerCase();
        if (childTag === "svg") continue;
        var childS = parseStyleStr(child.getAttribute("style") || "");
        if (childS.position === "absolute" || childS.position === "fixed") continue;

        // Width: explicit > parent content width for column, half parent for horizontal
        var cwExplicit = px(childS.width) || px(childS["inline-size"]);
        var cw = cwExplicit || contentW;
        var ch2 = px(childS.height) || px(childS["block-size"]) || px(childS["min-height"]) || 40;
        var hasMarginAuto = childS["margin-top"] === "auto" || childS["margin-block-start"] === "auto";
        childInfos.push({ el: child, s: childS, w: cw, h: ch2, marginAuto: hasMarginAuto });
      } else if (child.nodeType === 3 && child.textContent.trim()) {
        childInfos.push({ text: child.textContent.trim(), s: s, w: contentW, h: 24 });
      }
    }

    // For column flex with margin-top:auto, compute the auto margin
    var totalChildH = 0;
    var autoMarginIdx = -1;
    for (var ci2 = 0; ci2 < childInfos.length; ci2++) {
      if (childInfos[ci2].marginAuto) { autoMarginIdx = ci2; break; }
      totalChildH += childInfos[ci2].h + (ci2 > 0 ? gap : 0);
    }

    // Second pass: position children
    for (var ci3 = 0; ci3 < childInfos.length; ci3++) {
      var info = childInfos[ci3];

      // margin-top: auto pushes to bottom
      if (info.marginAuto && isColumn) {
        var remainingH = 0;
        for (var ri = ci3; ri < childInfos.length; ri++) remainingH += childInfos[ri].h + (ri > ci3 ? gap : 0);
        curY = parentY + h - padB - remainingH;
      }

      if (info.text) {
        // Bare text node
        var tl2 = makeText(info.text, info.s, curX, curY, contentW);
        layers.push(tl2);
        curY += (tl2._height || 24) + gap;
      } else {
        // Element child — recurse
        var childMarginL = px(info.s["margin-left"]) || px(info.s["margin-inline-start"]) || 0;
        var childPadL = px(info.s["padding-left"]) || px(info.s["padding-inline-start"]) || 0;
        var childLayers = buildLayers(info.el, curX + childMarginL, curY, info.w, info.h);
        if (childLayers.length > 0) {
          layers = layers.concat(childLayers);
          if (isColumn || display === "block") {
            curY += info.h + gap;
          } else {
            curX += info.w + childMarginL + gap;
          }
        }
        // If no layers produced (e.g., SVG-only span), don't advance cursor
      }
    }

    return layers;
  }

  // Build from root
  var rootS = parseStyleStr(root.getAttribute("style") || "");
  var artW = px(rootS.width) || px(rootS["inline-size"]) || 640;
  var artH = px(rootS.height) || px(rootS["block-size"]) || px(rootS["min-height"]) || 360;
  var rootBg = rootS["background-color"];
  var rootHasBg = rootBg && rootBg !== "rgba(0, 0, 0, 0)" && rootBg !== "transparent";

  // Flatten all layers with computed positions
  var allLayers = buildLayers(root, 0, 0, artW, artH);

  // Add background rect if root has background
  if (rootHasBg) {
    var corner = px(rootS["border-radius"]) || px(rootS["border-top-left-radius"]) || 0;
    allLayers.unshift({
      id: nanoid(),
      item: {
        type: "rect",
        x: 0, y: 0, width: artW, height: artH,
        cornerRadius: corner,
        angle: 0, scale: 1, opacity: 100,
        name: "Background",
        background: true, fillColor: rgbToHex(rootBg),
        strokeEnabled: false, shadowEnabled: false
      }
    });
  }

  // Wrap in artboard
  var artboard = {
    id: nanoid(),
    item: {
      type: "artboard",
      name: "UI2Code Scene",
      x: 0, y: 0,
      width: artW, height: artH,
      angle: 0, scale: 1, opacity: 100,
      background: false,
      fillColor: "#ffffff",
      shadowEnabled: false,
      duration: 4000
    },
    children: [
      { id: nanoid(), item: { type: "operationsTree" } },
      { id: nanoid(), item: { type: "layersTree" }, children: allLayers }
    ]
  };

  var payload = JSON.stringify({ layers: [artboard], operations: [] });
  await navigator.clipboard.writeText(payload);
}

// ============================================================================
// LOTTIELAB — Clipboard format: <div id="lottielab-paste">
//   <span id="layers" data-contents="URL_ENCODED_JSON"></span>
// </div>
// Encoding: encodeURIComponent(JSON.stringify(layersArray))
// Layer type: image-layer wrapping Lottie ty:2 spec
// ============================================================================
async function copyToClipboardForLottielab(rawHtml) {
  function waitForFocus() {
    if (document.hasFocus()) return Promise.resolve();
    return new Promise(resolve => window.addEventListener("focus", resolve, { once: true }));
  }

  // ── Lottielab helpers ─────────────────────────────────────────────────────
  function sp(value) {
    return { staticValue: value, defaultFrame: 0, keyframes: [] };
  }

  function parseCssColor(str) {
    if (!str || str === "transparent" || str === "rgba(0, 0, 0, 0)") return null;
    str = str.trim();
    const m = str.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
    if (m) return { r: Math.round(parseFloat(m[1])), g: Math.round(parseFloat(m[2])), b: Math.round(parseFloat(m[3])), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    if (str.startsWith("#")) {
      let hex = str.slice(1);
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), a: 1 };
    }
    return null;
  }

  function parseStyleAttr(el) {
    const s = {};
    const raw = el.getAttribute("style") || "";
    for (const part of raw.split(";")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) s[k] = v;
    }
    return s;
  }

  function pxVal(v) { return parseFloat(v) || 0; }

  function makeTransform(x, y, opacity, scaleX, scaleY, rotation) {
    return {
      position: { isLocked: false, staticValue: { x: x, y: y }, defaultFrame: 0, keyframes: [] },
      scale: { aspectRatioLocked: false, staticValue: [scaleX || 1, scaleY || 1], defaultFrame: 0, keyframes: [] },
      rotation: sp(rotation || 0),
      origin: { isLocked: true, staticValue: { x: 0, y: 0 }, defaultFrame: 0, keyframes: [] },
      skew: sp(0),
      skewAxis: sp(0),
      opacity: sp(opacity !== undefined ? opacity : 100),
    };
  }

  function makeShapeLayer(name, w, h, x, y, fillColor, strokeColor, strokeWidth, cornerRadius, opacity) {
    const styles = [];
    if (strokeColor) {
      styles.push({
        type: "stroke", hidden: false, opacity: sp(100),
        paint: { type: "solid", staticValue: { r: strokeColor.r, g: strokeColor.g, b: strokeColor.b }, defaultFrame: 0, keyframes: [] },
        thickness: sp(strokeWidth || 1), alignment: "centre", lineCap: "butt", lineJoin: "miter",
      });
    }
    if (fillColor) {
      styles.push({
        type: "fill", hidden: false, opacity: sp(fillColor.a !== undefined ? Math.round(fillColor.a * 100) : 100),
        paint: { type: "solid", staticValue: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, defaultFrame: 0, keyframes: [] },
      });
    }
    return {
      layerType: "shape-layer", name: name, locked: false,
      visibility: sp(true), fixedFrames: [],
      transform: makeTransform(x, y, opacity !== undefined ? opacity : 100),
      pathDirection: 1,
      geometry: {
        type: "rectangle",
        dimensions: { aspectRatioLocked: false, staticValue: [w, h], defaultFrame: 0, keyframes: [] },
        cornerRadius: sp(cornerRadius || 0),
      },
      styles: styles,
      trimPath: { start: sp(0), end: sp(100), offset: sp(0) },
      blendMode: "normal", effects: [], animations: [],
    };
  }

  function makeGroupLayer(name, x, y, opacity, childLayers) {
    return {
      layerType: "group-layer", name: name, locked: false,
      visibility: sp(true), fixedFrames: [],
      transform: makeTransform(x, y, opacity !== undefined ? opacity : 100),
      groupTypeProperties: { type: "group", styles: [] },
      blendMode: "normal",
      layers: childLayers,
    };
  }

  // ── Build styles array from SVG fill/stroke ────────────────────────────────
  function makeStyles(fillColor, strokeColor, strokeWidth, lineCap, lineJoin) {
    const styles = [];
    if (strokeColor) {
      styles.push({
        type: "stroke", hidden: false, opacity: sp(100),
        paint: { type: "solid", staticValue: { r: strokeColor.r, g: strokeColor.g, b: strokeColor.b }, defaultFrame: 0, keyframes: [] },
        thickness: sp(strokeWidth || 0.5), alignment: "centre",
        lineCap: lineCap || "round", lineJoin: lineJoin || "miter",
      });
    }
    if (fillColor) {
      styles.push({
        type: "fill", hidden: false, opacity: sp(fillColor.a !== undefined ? Math.round(fillColor.a * 100) : 100),
        paint: { type: "solid", staticValue: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, defaultFrame: 0, keyframes: [] },
      });
    }
    return styles;
  }

  // ── Parse SVG path d-attribute to Lottielab vector-path control points ────
  function svgDToVectorPath(d) {
    const points = [];
    // Simple parser: extract M, L, C, Z commands and their coordinates
    const cmds = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g);
    if (!cmds) return points;

    let cx = 0, cy = 0; // current position
    for (const cmd of cmds) {
      const type = cmd[0];
      const nums = cmd.slice(1).trim().match(/-?[\d.]+(?:e[+-]?\d+)?/g);
      const vals = nums ? nums.map(Number) : [];

      if (type === "M" || type === "m") {
        for (let i = 0; i < vals.length; i += 2) {
          cx = type === "M" ? vals[i] : cx + vals[i];
          cy = type === "M" ? vals[i+1] : cy + vals[i+1];
          points.push({ position: { x: cx, y: cy }, inTangent: { x: 0, y: 0 }, outTangent: { x: 0, y: 0 } });
        }
      } else if (type === "L" || type === "l") {
        for (let i = 0; i < vals.length; i += 2) {
          cx = type === "L" ? vals[i] : cx + vals[i];
          cy = type === "L" ? vals[i+1] : cy + vals[i+1];
          points.push({ position: { x: cx, y: cy }, inTangent: { x: 0, y: 0 }, outTangent: { x: 0, y: 0 } });
        }
      } else if (type === "H" || type === "h") {
        for (let i = 0; i < vals.length; i++) {
          cx = type === "H" ? vals[i] : cx + vals[i];
          points.push({ position: { x: cx, y: cy }, inTangent: { x: 0, y: 0 }, outTangent: { x: 0, y: 0 } });
        }
      } else if (type === "V" || type === "v") {
        for (let i = 0; i < vals.length; i++) {
          cy = type === "V" ? vals[i] : cy + vals[i];
          points.push({ position: { x: cx, y: cy }, inTangent: { x: 0, y: 0 }, outTangent: { x: 0, y: 0 } });
        }
      } else if (type === "C" || type === "c") {
        // Cubic bezier: C x1 y1 x2 y2 x y
        for (let i = 0; i < vals.length; i += 6) {
          const abs = type === "C";
          const x1 = abs ? vals[i] : cx + vals[i];
          const y1 = abs ? vals[i+1] : cy + vals[i+1];
          const x2 = abs ? vals[i+2] : cx + vals[i+2];
          const y2 = abs ? vals[i+3] : cy + vals[i+3];
          const ex = abs ? vals[i+4] : cx + vals[i+4];
          const ey = abs ? vals[i+5] : cy + vals[i+5];
          // Set outTangent on previous point (relative to previous point)
          if (points.length > 0) {
            const prev = points[points.length - 1];
            prev.outTangent = { x: x1 - prev.position.x, y: y1 - prev.position.y };
          }
          // New point with inTangent (relative to this point)
          points.push({
            position: { x: ex, y: ey },
            inTangent: { x: x2 - ex, y: y2 - ey },
            outTangent: { x: 0, y: 0 },
          });
          cx = ex; cy = ey;
        }
      } else if (type === "Z" || type === "z") {
        // Close path — no new point needed
      }
      // S, Q, T, A are less common — skip for now
    }
    return points;
  }

  // ── Make a text-layer (exact Lottielab format) ────────────────────────────
  function makeTextLayer(name, text, x, y, fontSize, fontWeight, fontFamily, fillColor, opacity, w, h) {
    return {
      layerType: "text-layer", name: name || text, locked: false,
      visibility: sp(true),
      transform: makeTransform(x, y, opacity !== undefined ? opacity : 100),
      content: text, autoRename: true,
      horizontalAlignment: 0, verticalAlignment: 0, layout: 2,
      fontFamilyTag: fontFamily || "Inter",
      fontWeight: fontWeight || 400, fontWidth: 100,
      fontSize: fontSize || 16, slant: 0,
      letterSpacing: 0, lineHeight: 100, paragraphSpacing: 0,
      layoutDimension: { aspectRatioLocked: false, staticValue: [w || 200, h || 50], defaultFrame: 0, keyframes: [] },
      fixedFrames: [],
      styles: makeStyles(fillColor || { r: 0, g: 0, b: 0 }, null, 0),
      blendMode: "normal", effects: [], animations: [], textAnimations: [],
    };
  }

  // ── Parse SVG element into Lottielab layers ───────────────────────────────
  function parseSvgElement(svgEl) {
    const layers = [];
    const svgW = parseFloat(svgEl.getAttribute("width")) || 100;
    const svgH = parseFloat(svgEl.getAttribute("height")) || 100;

    function walkSvg(el, parentName) {
      const tag = el.tagName.toLowerCase();

      if (tag === "path") {
        const d = el.getAttribute("d");
        if (!d) return;
        const fill = parseCssColor(el.getAttribute("fill"));
        const stroke = parseCssColor(el.getAttribute("stroke"));
        const sw = parseFloat(el.getAttribute("stroke-width")) || 0;
        const lc = el.getAttribute("stroke-linecap") || "round";
        const lj = el.getAttribute("stroke-linejoin") || "miter";
        const name = el.getAttribute("name") || parentName || "Path";
        const controlPoints = svgDToVectorPath(d);
        if (controlPoints.length < 2) return;
        layers.push({
          layerType: "shape-layer", name: name, locked: false,
          visibility: sp(true), fixedFrames: [],
          transform: makeTransform(0, 0, 100),
          pathDirection: 1,
          geometry: { type: "vector-path", staticValue: controlPoints, defaultFrame: 0, keyframes: [] },
          styles: makeStyles(fill, stroke, sw, lc, lj),
          trimPath: { start: sp(0), end: sp(100), offset: sp(0) },
          blendMode: "normal", effects: [], animations: [],
        });
      }

      if (tag === "circle") {
        const cx = parseFloat(el.getAttribute("cx")) || 0;
        const cy = parseFloat(el.getAttribute("cy")) || 0;
        const r = parseFloat(el.getAttribute("r")) || 1;
        const fill = parseCssColor(el.getAttribute("fill"));
        const opacityStr = el.getAttribute("opacity");
        const opacity = opacityStr ? Math.round(parseFloat(opacityStr) * 100) : 100;
        layers.push({
          layerType: "shape-layer", name: "Circle",
          locked: false, visibility: sp(true), fixedFrames: [],
          transform: makeTransform(cx, cy, opacity),
          pathDirection: 1,
          geometry: {
            type: "ellipse",
            dimensions: { aspectRatioLocked: true, staticValue: [r * 2, r * 2], defaultFrame: 0, keyframes: [] },
            arcStart: sp(0), arcSweep: sp(100), ratio: sp(0),
          },
          styles: makeStyles(fill, null, 0),
          trimPath: { start: sp(0), end: sp(100), offset: sp(0) },
          blendMode: "normal", effects: [], animations: [],
        });
      }

      if (tag === "ellipse") {
        const cx = parseFloat(el.getAttribute("cx")) || 0;
        const cy = parseFloat(el.getAttribute("cy")) || 0;
        const rx = parseFloat(el.getAttribute("rx")) || 1;
        const ry = parseFloat(el.getAttribute("ry")) || 1;
        const fill = parseCssColor(el.getAttribute("fill"));
        layers.push({
          layerType: "shape-layer", name: "Ellipse",
          locked: false, visibility: sp(true), fixedFrames: [],
          transform: makeTransform(cx, cy, 100),
          pathDirection: 1,
          geometry: {
            type: "ellipse",
            dimensions: { aspectRatioLocked: false, staticValue: [rx * 2, ry * 2], defaultFrame: 0, keyframes: [] },
            arcStart: sp(0), arcSweep: sp(100), ratio: sp(0),
          },
          styles: makeStyles(fill, null, 0),
          trimPath: { start: sp(0), end: sp(100), offset: sp(0) },
          blendMode: "normal", effects: [], animations: [],
        });
      }

      if (tag === "rect") {
        const x = parseFloat(el.getAttribute("x")) || 0;
        const y = parseFloat(el.getAttribute("y")) || 0;
        const rw = parseFloat(el.getAttribute("width")) || 0;
        const rh = parseFloat(el.getAttribute("height")) || 0;
        const rx = parseFloat(el.getAttribute("rx")) || 0;
        const fill = parseCssColor(el.getAttribute("fill"));
        const stroke = parseCssColor(el.getAttribute("stroke"));
        const sw = parseFloat(el.getAttribute("stroke-width")) || 0;
        layers.push(makeShapeLayer("Rect", rw, rh, x + rw/2, y + rh/2, fill, stroke, sw, rx));
      }

      if (tag === "line") {
        const x1 = parseFloat(el.getAttribute("x1")) || 0;
        const y1 = parseFloat(el.getAttribute("y1")) || 0;
        const x2 = parseFloat(el.getAttribute("x2")) || 0;
        const y2 = parseFloat(el.getAttribute("y2")) || 0;
        const stroke = parseCssColor(el.getAttribute("stroke"));
        const sw = parseFloat(el.getAttribute("stroke-width")) || 1;
        layers.push({
          layerType: "shape-layer", name: "Line", locked: false,
          visibility: sp(true), fixedFrames: [],
          transform: makeTransform(0, 0, 100), pathDirection: 1,
          geometry: {
            type: "vector-path",
            staticValue: [
              { position: { x: x1, y: y1 }, inTangent: { x: 0, y: 0 }, outTangent: { x: 0, y: 0 } },
              { position: { x: x2, y: y2 }, inTangent: { x: 0, y: 0 }, outTangent: { x: 0, y: 0 } },
            ], defaultFrame: 0, keyframes: [],
          },
          styles: makeStyles(null, stroke, sw),
          trimPath: { start: sp(0), end: sp(100), offset: sp(0) },
          blendMode: "normal", effects: [], animations: [],
        });
      }

      if (tag === "text") {
        const textContent = el.textContent || "";
        if (!textContent.trim()) return;
        const x = parseFloat(el.getAttribute("x")) || 0;
        const y = parseFloat(el.getAttribute("y")) || 0;
        const fill = parseCssColor(el.getAttribute("fill")) || { r: 0, g: 0, b: 0 };
        const fontSize = parseFloat(el.getAttribute("font-size")) || 14;
        layers.push(makeTextLayer("Text", textContent.trim(), x, y, fontSize, 400, "Inter", fill, 100, 200, 30));
      }

      // Recurse into g children, wrapping in a group-layer
      if (tag === "g") {
        const gName = el.getAttribute("name") || el.getAttribute("filter") ? "Effect Group" : "Group";
        const before = layers.length;
        for (const child of el.children) {
          walkSvg(child, gName);
        }
        // If the g produced layers, optionally wrap them (keep flat for simplicity)
      }
      // Skip defs/filter/clippath/mask — not visual
      if (tag === "defs" || tag === "filter" || tag === "clippath" || tag === "mask") return;
    }

    for (const child of svgEl.children) {
      walkSvg(child, "SVG");
    }

    return { layers, w: svgW, h: svgH };
  }

  // ── Recursively convert HTML elements to Lottielab layers ─────────────────
  function convertElement(el, offsetX, offsetY) {
    const tag = el.tagName.toLowerCase();
    const s = parseStyleAttr(el);
    const layers = [];

    // Get dimensions
    const w = pxVal(s.width) || pxVal(s["min-width"]) || pxVal(s["inline-size"]) || 100;
    const h = pxVal(s.height) || pxVal(s["min-height"]) || 40;
    const opacity = s.opacity !== undefined ? Math.round(parseFloat(s.opacity) * 100) : 100;
    const bgColor = parseCssColor(s["background-color"] || s.background);
    const borderRadius = pxVal(s["border-radius"]);
    const borderColor = parseCssColor(s["border-color"] || s["border-top-color"]);
    const borderWidth = pxVal(s["border-width"] || s["border-top-width"]);
    const name = el.getAttribute("class") || el.getAttribute("data-class") || tag;
    const shortName = name.split(" ")[0].split("_").pop() || tag;

    // Create background rect if element has visible background
    if (bgColor) {
      layers.push(makeShapeLayer(shortName + " bg", w, h, offsetX + w/2, offsetY + h/2, bgColor, borderColor, borderWidth, borderRadius, opacity));
    }

    // Check for text content (no child elements = text-only element)
    if (el.children.length === 0) {
      const textContent = el.textContent ? el.textContent.trim() : "";
      if (textContent) {
        const textColor = parseCssColor(s.color) || { r: 0, g: 0, b: 0 };
        const fontSize = pxVal(s["font-size"]) || 16;
        const fw = parseInt(s["font-weight"]) || 400;
        const ff = (s["font-family"] || "Inter").split(",")[0].trim().replace(/['"]/g, "");
        const sysFont = ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"].includes(ff);
        layers.push(makeTextLayer(shortName, textContent, offsetX + w/2, offsetY + h/2, fontSize, fw, sysFont ? "Inter" : ff, textColor, opacity, w, h));
      }
      return layers;
    }

    // Process children
    for (const child of el.children) {
      const childTag = child.tagName.toLowerCase();

      if (childTag === "svg") {
        const svgResult = parseSvgElement(child);
        const cs = parseStyleAttr(child);
        const svgX = pxVal(cs.left) || 0;
        const svgY = pxVal(cs.top) || 0;
        const svgOpacity = cs.opacity !== undefined ? Math.round(parseFloat(cs.opacity) * 100) : 100;
        const svgW = pxVal(cs.width) || svgResult.w;
        const svgH = pxVal(cs.height) || svgResult.h;

        if (svgResult.layers.length > 0) {
          layers.push(makeGroupLayer(
            "SVG",
            offsetX + svgX + svgW / 2,
            offsetY + svgY + svgH / 2,
            svgOpacity,
            svgResult.layers
          ));
        }
      } else {
        // Recursively process HTML children
        const cs = parseStyleAttr(child);
        const childX = pxVal(cs.left) || pxVal(cs["margin-left"]) || 0;
        const childY = pxVal(cs.top) || pxVal(cs["margin-top"]) || 0;
        const childLayers = convertElement(child, offsetX + childX, offsetY + childY);
        layers.push(...childLayers);
      }
    }

    return layers;
  }

  // ── Parse HTML and convert ────────────────────────────────────────────────
  const tmpDiv = document.createElement("div");
  tmpDiv.innerHTML = rawHtml;
  const rootEl = tmpDiv.firstElementChild;
  if (!rootEl) return;

  const allLayers = convertElement(rootEl, 0, 0);

  // Cap layers and keep flat (no group wrapper — Lottielab may reject groups on paste)
  const lottieLayers = allLayers.slice(0, 15);

  const lottiePasteHTML = `\n    <meta charset="utf-8">\n    <div id="lottielab-paste">\n      <span id="layers" data-contents="${encodeURIComponent(JSON.stringify(lottieLayers))}"></span>\n    </div>\n  `;

  await waitForFocus();

  return new Promise((resolve) => {
    const handler = (e) => {
      e.preventDefault();
      e.clipboardData.setData("text/html", lottiePasteHTML);
      document.removeEventListener("copy", handler, true);
      resolve();
    };
    document.addEventListener("copy", handler, true);
    document.execCommand("copy");
  });
}

// ============================================================================
// ELEMENT PICKER — Direct port from Paper Snapshot: element-picker.ts
// Only change: "x-paper-toast" → "ui2code-toast", attribute name
// ============================================================================
async function elementPicker() {
  const pointer = { x: 0, y: 0 };
  const ignoredElementsFromHitTesting = [document.body, document.documentElement, "ui2code-toast"];
  const elementsUpPath = [];
  const elementsDownPath = [];
  const registeredChildDocuments = [];

  const blanket = document.createElement("div");
  blanket.style.position = "fixed";
  blanket.style.inset = "0";
  blanket.style.zIndex = "2147483646";
  blanket.style.overflow = "hidden";
  ignoredElementsFromHitTesting.push(blanket);

  const outlineContainer = document.createElement("div");
  outlineContainer.style.position = "fixed";
  outlineContainer.style.inset = "0";
  outlineContainer.style.overflow = "hidden";
  outlineContainer.style.pointerEvents = "none";
  outlineContainer.style.zIndex = "2147483645";

  const outline = document.createElement("div");
  outline.style.position = "absolute";
  outline.style.border = "2px solid oklch(0.7 0.15 258)";
  outline.style.boxSizing = "border-box";
  outline.style.top = "0";
  outline.style.left = "0";
  outlineContainer.appendChild(outline);

  let selectedElement = null;
  let modality = "mouse";
  let nextTickState = "wait";

  function notifyOtherDocuments(id, direction = "both") {
    if (nextTickState === "complete") return;
    if (direction === "children" || direction === "both") {
      registeredChildDocuments.forEach((doc) => doc.postMessage(id, "*"));
    }
    if (direction === "parent" || direction === "both") {
      window.parent.postMessage(id, "*");
    }
  }

  function listenForOtherDocuments(id, callback) {
    const onMessageHandler = (event) => {
      if (event.data === id && event.source !== window) callback(event);
    };
    window.addEventListener("message", onMessageHandler);
    return () => window.removeEventListener("message", onMessageHandler);
  }

  function hitTest() {
    const hits = document.elementsFromPoint(pointer.x, pointer.y).filter((el) => {
      if (el instanceof HTMLElement) {
        return !ignoredElementsFromHitTesting.some((ignored) => {
          if (ignored instanceof Element) return el === ignored;
          return el.tagName.toLowerCase() === ignored;
        });
      }
      return false;
    });
    return hits.at(0);
  }

  function tick() {
    if (nextTickState === "complete") return;
    requestAnimationFrame(tick);

    if (nextTickState === "completing") { outline.style.opacity = "0"; return; }
    if (nextTickState === "wait") { outline.style.opacity = "0"; selectedElement = null; return; }

    if (nextTickState === "move-to-child-document") {
      outline.style.opacity = "0";
      blanket.style.pointerEvents = "none";
      nextTickState = "continue";
      selectedElement = null;
    }

    if (nextTickState === "clear-outline") {
      outline.style.opacity = "0";
      nextTickState = "continue";
      selectedElement = null;
    }

    if (document.hasFocus() === false || document.activeElement === null || document.activeElement.tagName === "IFRAME") {
      window.focus();
    }

    const element = modality === "keyboard" ? selectedElement : hitTest();
    if (!element) { outline.style.opacity = "0"; return; }
    if (element.tagName === "IFRAME") { nextTickState = "move-to-child-document"; return; }

    blanket.style.pointerEvents = "auto";
    const rect = element.getBoundingClientRect();
    outline.style.opacity = "1";
    outline.style.translate = `${rect.left}px ${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    selectedElement = element;
    notifyOtherDocuments("TRANSFER_PAPER_HIGHLIGHTED", "children");
  }

  function onPointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (nextTickState === "wait") nextTickState = "continue";
  }

  window.addEventListener("pointermove", onPointerMove);
  document.body.appendChild(blanket);
  document.body.appendChild(outlineContainer);
  tick();

  return new Promise((resolve) => {
    function cleanup() {
      setTimeout(() => { blanket.remove(); outline.remove(); outlineContainer.remove(); }, 21);
      disposables.forEach((dispose) => dispose());
      window.removeEventListener("pointermove", onPointerMove);
      notifyOtherDocuments("TRANSFER_PAPER_COMPLETED");
      nextTickState = "complete";
    }

    const disposables = [
      listenForOtherDocuments("TRANSFER_PAPER_COMPLETED", () => { cleanupEvents(); cleanup(); resolve(null); }),
      listenForOtherDocuments("TRANSFER_PAPER_HIGHLIGHTED", () => { nextTickState = "wait"; }),
      listenForOtherDocuments("TRANSFER_PAPER_REGISTER_CHILD_DOCUMENT", (event) => { registeredChildDocuments.push(event.source); }),
    ];

    function cleanupEvents() {
      window.removeEventListener("click", completeSelectionHandler, { capture: true });
      window.removeEventListener("pointerdown", pointerDownHandler, { capture: true });
      window.removeEventListener("pointermove", pointerMoveCaptureHandler, { capture: true });
      window.removeEventListener("keydown", keyDownHandler, { capture: true });
    }

    function pointerDownHandler(e) {
      if (nextTickState !== "complete" && nextTickState !== "completing") { e.preventDefault(); e.stopPropagation(); }
    }

    function completeSelectionHandler(e) {
      e.stopPropagation();
      cleanupEvents();
      nextTickState = "completing";

      if (selectedElement) {
        const key = "data-ui2code-picker";
        const value = Date.now();
        selectedElement.setAttribute(key, `${value}`);
        resolve(`[${key}="${value}"]`);
      } else {
        resolve(null);
      }
      cleanup();
    }

    function pointerMoveCaptureHandler() {
      modality = "mouse";
      elementsUpPath.length = 0;
      elementsDownPath.length = 0;
    }

    function keyDownHandler(e) {
      function nextTopElement(element) {
        const nextElement = element.parentElement;
        if (nextElement && nextElement.checkVisibility() && nextElement.clientWidth && nextElement.clientHeight && !ignoredElementsFromHitTesting.includes(nextElement)) {
          return nextElement;
        }
        if (nextElement?.parentElement) return nextTopElement(nextElement.parentElement);
        return null;
      }

      function nextBottomElement(element) {
        let nextSiblingElement = element.nextElementSibling;
        while (nextSiblingElement) {
          if (nextSiblingElement.checkVisibility() && nextSiblingElement.clientWidth && nextSiblingElement.clientHeight && !ignoredElementsFromHitTesting.includes(nextSiblingElement) && nextSiblingElement instanceof HTMLElement) return nextSiblingElement;
        }
        const children = Array.from(element.children);
        for (const child of children) {
          if (child instanceof HTMLElement && child.checkVisibility() && child.clientWidth && child.clientHeight && !ignoredElementsFromHitTesting.includes(child)) return child;
        }
        return null;
      }

      if (selectedElement && e.key.startsWith("Arrow")) {
        e.preventDefault(); e.stopPropagation(); modality = "keyboard";
        switch (e.key) {
          case "ArrowUp":
            if (elementsDownPath.length > 0) { selectedElement = elementsDownPath.pop(); }
            else { const next = nextTopElement(selectedElement); if (next) { elementsUpPath.push(selectedElement); selectedElement = next; } }
            break;
          case "ArrowDown":
            if (elementsUpPath.length > 0) { selectedElement = elementsUpPath.pop(); }
            else if (selectedElement.children[0] instanceof HTMLElement) { const next = nextBottomElement(selectedElement.children[0]); if (next) { elementsDownPath.push(selectedElement); selectedElement = next; } }
            break;
        }
        return;
      }

      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanupEvents(); cleanup(); resolve(null); }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); completeSelectionHandler(e); }
    }

    window.addEventListener("click", completeSelectionHandler, { capture: true });
    window.addEventListener("pointerdown", pointerDownHandler, { capture: true });
    window.addEventListener("pointermove", pointerMoveCaptureHandler, { capture: true });
    window.addEventListener("keydown", keyDownHandler, { capture: true });
    notifyOtherDocuments("TRANSFER_PAPER_REGISTER_CHILD_DOCUMENT", "parent");
  });
}

// ============================================================================
// ELEMENT SERIALIZER — Direct port from Paper Snapshot: element-serializer.ts
// Only change: toast element name "x-paper-toast" → "ui2code-toast"
//              CSS var names "--x-paper-*" → "--ui2code-*"
// ============================================================================
async function elementSerializer(selector) {
  const alwaysSerialize = ["display"];
  const toast = document.getElementsByTagName("ui2code-toast")[0];
  const styleNames = Array.from(window.getComputedStyle(document.body));
  styleNames.push("aspect-ratio", "text-underline-offset", "text-decoration-thickness", "transform-box");
  // Ensure animation/transition longhands are captured so pasted markup replays motion.
  // (getComputedStyle already enumerates these on every modern browser, but push them
  //  defensively — duplicates just re-read the same key and are harmless.)
  for (const animProp of [
    "transition", "transition-property", "transition-duration",
    "transition-timing-function", "transition-delay", "transition-behavior",
    "animation", "animation-name", "animation-duration", "animation-timing-function",
    "animation-delay", "animation-iteration-count", "animation-direction",
    "animation-fill-mode", "animation-play-state",
  ]) {
    if (!styleNames.includes(animProp)) styleNames.push(animProp);
  }

  let totalNodesToProcess = 0;

  function setToastProgress(processedNodesCount) {
    if (processedNodesCount === null || !toast) {
      const shadowRoot = toast?.shadowRoot;
      if (shadowRoot && toast) {
        const progressEl = shadowRoot.querySelector(".toast__progress");
        if (progressEl) {
          progressEl.classList.add("no-transition");
          toast.style.setProperty("--ui2code-progress", "0");
          requestAnimationFrame(() => {
            progressEl.classList.remove("no-transition");
            toast?.style.removeProperty("--ui2code-progress");
          });
        } else {
          toast.style.removeProperty("--ui2code-progress");
        }
      } else if (toast) {
        toast.style.removeProperty("--ui2code-progress");
      }
      toast?.style.removeProperty("--ui2code-suffix");
      toast?.style.removeProperty("--ui2code-suffix-width");
      return;
    }
    if (!toast) return;
    const percentage = Math.min(Math.ceil((processedNodesCount / totalNodesToProcess) * 100), 100);
    if (totalNodesToProcess > 50) {
      toast.style.setProperty("--ui2code-progress", percentage.toString());
      if (totalNodesToProcess > 100) {
        toast.style.setProperty("--ui2code-suffix", `"${percentage.toString()}%"`);
        toast.style.setProperty("--ui2code-suffix-width", "48px");
      }
    } else {
      toast.style.removeProperty("--ui2code-suffix-width");
    }
  }

  function isScaledToZeroAndOutOfFlow(styles) {
    return (
      ["matrix(0, 0, 0, 1, 0, 0)", "matrix(0, 0, 0, 0, 0, 0)", "scaleX(0)", "scale(0)", "scaleY(0)"].includes(styles.transform || "") &&
      ["absolute", "fixed"].includes(styles.position || "")
    );
  }

  function isChildOfSVG(node) {
    let parent = node.parentElement;
    while (parent) {
      if (parent instanceof SVGElement) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function toInlineStyles(styles) {
    return Object.entries(styles).map(([key, value]) => `${key}: ${value.replaceAll('"', "'")};`).join(" ");
  }

  function encodeHTML(str) {
    return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  // Resolve the actual text content of a ::before/::after pseudo-element
  function resolvePseudoContent(element, pseudo, styles) {
    if (!styles.content) return "";
    const raw = styles.content;
    if (raw === "none" || raw === "normal") return "";

    // For open-quote / close-quote, use the browser's computed content
    // which is already the resolved quote character as a string like '"'
    if (raw === "open-quote" || raw === "close-quote") {
      // Try getting the actual rendered content from the pseudo-element
      const computed = window.getComputedStyle(element, pseudo);
      const computedContent = computed.content;
      if (computedContent && computedContent !== "none" && computedContent !== "normal"
          && computedContent !== "open-quote" && computedContent !== "close-quote") {
        // Strip wrapping quotes from computed value: '"' → " or "\201C" → \u201C
        const stripped = computedContent.replace(/^["']|["']$/g, "");
        if (stripped) return stripped;
      }
      // Fallback to curly quotes
      return raw === "open-quote" ? "\u201C" : "\u201D";
    }

    // String value like: "»" or "• " — strip wrapping quotes
    const strMatch = raw.match(/^["'](.*)["']$/);
    if (strMatch) return strMatch[1];
    // Bare string without quotes
    if (raw.length <= 3 && raw !== "''") return raw;
    return "";
  }

  function resolveParentBgColor(element) {
    const parent = element?.parentElement;
    if (parent) {
      const backgroundColor = window.getComputedStyle(parent).backgroundColor;
      if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" && backgroundColor !== "transparent") return backgroundColor;
      return resolveParentBgColor(parent);
    }
    return "";
  }

  function resolveComputedStyles(element, { isRoot = false, pseudo } = {}) {
    const styles = {};
    const computedStylesValues = new Map();

    if (pseudo) {
      const computedStyles = window.getComputedStyle(element, pseudo);
      for (const key of styleNames) {
        computedStylesValues.set(key, computedStyles.getPropertyValue(key));
      }
    } else {
      const computedStyles = element.computedStyleMap();
      for (const key of styleNames) {
        const value = computedStyles.get(key);
        if (value) computedStylesValues.set(key, value.toString());
      }
    }

    const referenceStyleValues = new Map();
    const referenceElement = document.createElement("link");
    referenceElement.textContent = element.textContent;
    referenceElement.style.margin = "0";
    referenceElement.style.fill = "black";
    referenceElement.style.color = "black";
    referenceElement.style.fontSize = "1px";
    referenceElement.style.width = "auto";
    referenceElement.style.height = "auto";
    referenceElement.style.textAlign = "initial";
    referenceElement.style.borderColor = "hotpink";
    referenceElement.style.setProperty("z-index", "auto", "important");
    referenceElement.style.setProperty("border-width", "0px", "important");

    if (isRoot) {
      referenceElement.style.color = "hotpink";
      referenceElement.style.lineHeight = "0.1234";
      referenceElement.style.fontFamily = '"Papyrus"';
      referenceElement.style.listStyleType = "initial";
    }

    // Place the reference element so its computed baseline is read in the same
    // cascade context as `element`. Sibling placement is ideal (identical
    // inherited context), but it THROWS HierarchyRequestError for two real cases
    // that used to abort the whole capture: an element inside an SVG subtree
    // (an HTML <link> is not a valid SVG-namespace sibling), and an element that
    // a virtualised list detached mid-walk (no parent to insert beside). Fall
    // back to the element's own parent, then into the element itself, then to
    // body. A later fallback shifts the inherited baseline by one level at most,
    // which mislabels a few inherited properties as non-default — verbose, but
    // correct — and only for the elements sibling placement cannot handle.
    let placed = false;
    const tryPlace = (fn) => { if (placed) return; try { fn(); placed = true; } catch { /* try next */ } };
    if (element.parentElement?.lastElementChild === element) {
      tryPlace(() => element.insertAdjacentElement("afterend", referenceElement));
    } else {
      tryPlace(() => element.insertAdjacentElement("beforebegin", referenceElement));
    }
    tryPlace(() => element.parentElement.appendChild(referenceElement));
    tryPlace(() => element.appendChild(referenceElement));
    tryPlace(() => document.body.appendChild(referenceElement));
    if (!placed) {
      // Could not place it anywhere in this document — skip the diff for this
      // node and keep every computed value, rather than throwing.
      referenceElement.remove?.();
    } else if (pseudo) {
      const referenceComputedStyles = window.getComputedStyle(referenceElement, pseudo);
      for (const key of styleNames) {
        referenceStyleValues.set(key, referenceComputedStyles.getPropertyValue(key));
      }
    } else {
      const referenceComputedStyles = referenceElement.computedStyleMap();
      for (const key of styleNames) {
        const value = referenceComputedStyles.get(key);
        if (value) referenceStyleValues.set(key, value.toString());
      }
    }
    referenceElement.remove();

    for (const key of styleNames) {
      const value = computedStylesValues.get(key);
      const referenceValue = referenceStyleValues.get(key);
      if (value && !value.startsWith("--") && (value !== referenceValue || alwaysSerialize.includes(key))) {
        styles[key] = value.replaceAll('"', "'");
      }
    }

    if (isRoot) {
      const box = element.getBoundingClientRect();
      const width = Math.ceil(box.width) + "px";
      if (box.width > 200 || box.height > 200 || styles.width?.includes("%") || styles.height?.includes("%")) {
        // Set explicit width so layout columns/grids work correctly
        styles.width = width;
        // Use min-height instead of fixed height so content isn't clipped
        styles["min-height"] = Math.ceil(box.height) + "px";
        styles.height = "auto";
      }
      // Remove overflow clipping on root — let full content show
      delete styles["overflow"];
      delete styles["overflow-x"];
      delete styles["overflow-y"];
      delete styles["overflow-block"];
      delete styles["overflow-inline"];
    }

    const rootBackgroundInvisible =
      isRoot && element instanceof Element &&
      (!computedStylesValues.get("background-color") || computedStylesValues.get("background-color") === "rgba(0, 0, 0, 0)");

    if (rootBackgroundInvisible) {
      styles["background-color"] = resolveParentBgColor(element);
    }

    if (styles["scrollbar-gutter"]?.includes("stable") && element instanceof HTMLElement) {
      const borderLeft = parseFloat(computedStylesValues.get("border-left-width") || "0");
      const borderRight = parseFloat(computedStylesValues.get("border-right-width") || "0");
      const scrollbarWidth = element.offsetWidth - element.clientWidth - borderLeft - borderRight;
      if (scrollbarWidth > 0) {
        const isBothSides = styles["scrollbar-gutter"].includes("both");
        const direction = computedStylesValues.get("direction") || "ltr";
        const currentPaddingRight = parseFloat(styles["padding-right"] || "0");
        const currentPaddingLeft = parseFloat(styles["padding-left"] || "0");
        if (direction === "rtl") {
          styles["padding-left"] = currentPaddingLeft + scrollbarWidth + "px";
          if (isBothSides) styles["padding-right"] = currentPaddingRight + scrollbarWidth + "px";
        } else {
          styles["padding-right"] = currentPaddingRight + scrollbarWidth + "px";
          if (isBothSides) styles["padding-left"] = currentPaddingLeft + scrollbarWidth + "px";
        }
      }
    }

    if (((pseudo === "::after" || pseudo === "::before") && !styles.content) || Object.keys(styles).length === 0) {
      return {};
    }

    return styles;
  }

  function collapseWhiteSpace(node) {
    const text = node.textContent;
    if (!text) return "";

    if (node.parentElement) {
      const whiteSpace = window.getComputedStyle(node.parentElement).whiteSpace;
      if (whiteSpace === "pre" || whiteSpace === "pre-wrap") return text;
      if (whiteSpace === "pre-line") return text.replace(/[^\S\n]+/g, " ");
    }

    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed) {
      const leadingLength = text.length - text.trimStart().length;
      const trailingLength = text.length - text.trimEnd().length;
      let preserveLeading = false;
      let preserveTrailing = false;

      if (leadingLength > 0) {
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, leadingLength);
        preserveLeading = range.getBoundingClientRect().width > 0;
      }
      if (trailingLength > 0) {
        const range = document.createRange();
        range.setStart(node, text.length - trailingLength);
        range.setEnd(node, text.length);
        preserveTrailing = range.getBoundingClientRect().width > 0;
      }
      return (preserveLeading ? " " : "") + trimmed + (preserveTrailing ? " " : "");
    }

    const range = document.createRange();
    range.selectNode(node);
    if (range.getBoundingClientRect().width === 0) return "";
    return " ";
  }

  // ── CSS ANIMATION CAPTURE ─────────────────────────────────────────────────
  // Computed styles reference animation names but never the @keyframes bodies,
  // so pasted markup would lose its motion. Collect every animation name used by
  // the captured subtree (element + descendants + ::before/::after), then resolve
  // the matching @keyframes rules from the page's stylesheets into a <style> tag.

  // Collect the set of animation-name values used across the subtree.
  function collectAnimationNames(root) {
    const names = new Set();
    const readEl = (el) => {
      for (const pseudo of [null, "::before", "::after"]) {
        let animationName;
        try {
          animationName = window.getComputedStyle(el, pseudo).animationName;
        } catch {
          continue;
        }
        if (!animationName || animationName === "none") continue;
        for (const part of animationName.split(",")) {
          const name = part.trim();
          if (name && name !== "none") names.add(name);
        }
      }
    };
    readEl(root);
    root.querySelectorAll("*").forEach(readEl);
    return names;
  }

  // Extract a single `@keyframes <name> { ... }` block from raw CSS text using
  // brace matching (used as a fallback for cross-origin sheets fetched by URL).
  function extractKeyframesBlockFromText(cssText, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("@(?:-webkit-)?keyframes\\s+" + escaped + "\\s*\\{", "g");
    const match = re.exec(cssText);
    if (!match) return "";
    let i = match.index + match[0].length;
    let depth = 1;
    while (i < cssText.length && depth > 0) {
      const c = cssText[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    return depth === 0 ? cssText.slice(match.index, i) : "";
  }

  // Walk document.styleSheets (recursing into @media / @supports groups) and
  // collect the cssText of every @keyframes rule whose name is in `names`.
  // Falls back to fetching cross-origin sheets and regex-parsing their text.
  async function collectKeyframes(names) {
    if (!names || names.size === 0) return "";
    const found = new Map(); // name -> cssText
    const crossOriginHrefs = [];

    const scanRules = (rules) => {
      for (const rule of rules) {
        if (typeof CSSKeyframesRule !== "undefined" && rule instanceof CSSKeyframesRule) {
          if (names.has(rule.name) && !found.has(rule.name)) found.set(rule.name, rule.cssText);
        } else if (typeof CSSGroupingRule !== "undefined" && rule instanceof CSSGroupingRule && rule.cssRules) {
          // @media / @supports — recurse.
          try { scanRules(rule.cssRules); } catch {}
        } else if (rule.cssRules) {
          try { scanRules(rule.cssRules); } catch {}
        }
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules; // cross-origin sheets throw here.
      } catch {
        if (sheet.href) crossOriginHrefs.push(sheet.href);
        continue;
      }
      if (rules) {
        try { scanRules(rules); } catch {}
      }
    }

    // Fallback: fetch cross-origin sheets from the page origin and parse by regex.
    // fetch may still be CORS-blocked — wrap per-sheet and skip failures silently.
    if (crossOriginHrefs.length && [...names].some((n) => !found.has(n))) {
      for (const href of crossOriginHrefs) {
        if ([...names].every((n) => found.has(n))) break;
        try {
          const res = await fetch(href);
          if (!res.ok) continue;
          const text = await res.text();
          for (const name of names) {
            if (found.has(name)) continue;
            const block = extractKeyframesBlockFromText(text, name);
            if (block) found.set(name, block);
          }
        } catch {}
      }
    }

    if (found.size === 0) return "";
    return `<style data-captured-animations>${Array.from(found.values()).join("\n")}</style>`;
  }

  async function serialize(target, { abortSignal, dryRun = false, __isRoot = true, __processedNodes = 0 } = {}) {
    if (abortSignal?.aborted) return { html: "", processedNodes: 0 };
    if (!dryRun) setToastProgress(__processedNodes + 1);

    if (!(target instanceof Element || target instanceof SVGElement)) {
      if (dryRun) return { html: "", processedNodes: 1 };
      if (target instanceof Text) {
        const normalizedText = collapseWhiteSpace(target);
        return { html: encodeHTML(normalizedText), processedNodes: 1 };
      }
      return { html: "", processedNodes: 1 };
    }

    const tagName = target.tagName.toLowerCase();
    const targetComputedStyles = window.getComputedStyle(target);
    const isOutOfFlow = ["absolute", "fixed"].includes(targetComputedStyles.position);
    const isNormalFlowChild = !!target.parentElement && ["block", "inline-block"].includes(window.getComputedStyle(target.parentElement).display);
    const hasVerySmallDimensions = parseFloat(targetComputedStyles.height) === 0 || parseFloat(targetComputedStyles.width) === 0;
    const isHiddenPixelOutOfFlow = hasVerySmallDimensions && (isOutOfFlow || isNormalFlowChild);
    const isDisplayNone = targetComputedStyles.display === "none";
    const isTransparentAndOutOfFlow = targetComputedStyles.opacity === "0" && isOutOfFlow;

    if (isHiddenPixelOutOfFlow || isDisplayNone || isTransparentAndOutOfFlow) {
      return { html: "", processedNodes: 1 };
    }

    let processedNodes = 1;
    const children = [];
    let styles = {};

    if (!dryRun) {
      const beforeStyles = resolveComputedStyles(target, { pseudo: "::before" });
      if (Object.keys(beforeStyles).length && !isScaledToZeroAndOutOfFlow(beforeStyles)) {
        const beforeText = resolvePseudoContent(target, "::before", beforeStyles);
        delete beforeStyles.content; // content doesn't work on regular elements
        const isInlinePseudo = beforeStyles.display === "inline" || beforeStyles.display === "inline-block";
        const pseudoTag = isInlinePseudo ? "span" : "div";
        children.push(`<${pseudoTag} style="${toInlineStyles(beforeStyles)}">${encodeHTML(beforeText)}</${pseudoTag}>`);
      }
      styles = resolveComputedStyles(target, { isRoot: __isRoot });

      // BROWSER FIX: Elements like <fieldset>, <button>, <select>, <input>, <textarea>,
      // <legend> have user-agent default backgrounds (Canvas, ButtonFace, Field).
      // Paper Snapshot skips transparent backgrounds because they match the <link> reference,
      // but paper.design has no UA stylesheet. For browser rendering, we must explicitly
      // set background-color to override UA defaults.
      const uaBgElements = ["fieldset", "button", "select", "input", "textarea", "legend", "hr"];
      if (uaBgElements.includes(tagName)) {
        if (!styles["background-color"]) styles["background-color"] = targetComputedStyles.backgroundColor;
        if (!styles["border-style"]) styles["border-style"] = targetComputedStyles.borderStyle || "none";
        if (!styles["border-width"]) styles["border-width"] = targetComputedStyles.borderWidth || "0px";
        if (!styles["border-color"]) styles["border-color"] = targetComputedStyles.borderColor;
        if (!styles["appearance"]) { styles["appearance"] = "none"; styles["-webkit-appearance"] = "none"; }
        if (!styles["padding"] && !styles["padding-top"]) {
          styles["padding-top"] = targetComputedStyles.paddingTop;
          styles["padding-right"] = targetComputedStyles.paddingRight;
          styles["padding-bottom"] = targetComputedStyles.paddingBottom;
          styles["padding-left"] = targetComputedStyles.paddingLeft;
        }
        if (!styles["margin"] && !styles["margin-top"]) {
          styles["margin-top"] = targetComputedStyles.marginTop;
          styles["margin-right"] = targetComputedStyles.marginRight;
          styles["margin-bottom"] = targetComputedStyles.marginBottom;
          styles["margin-left"] = targetComputedStyles.marginLeft;
        }
      }
      // Force text-decoration for <a> tags (UA adds underlines)
      if (tagName === "a" && !styles["text-decoration"]) {
        styles["text-decoration"] = targetComputedStyles.textDecoration || "none";
      }
    }

    const targetAttributes = target.getAttributeNames().map((name) => [name, target.getAttribute(name) || ""]);

    for (let i = 0; i < target.childNodes.length; i++) {
      const child = target.childNodes[i];
      const childrenToTraverse = [];

      if (child instanceof SVGElement && child.tagName === "use") {
        const href = child.getAttribute("href") || child.getAttribute("xlink:href");
        const referencedElement = document.getElementById(href?.replace("#", "") || "");
        if (referencedElement) {
          if (["symbol", "svg"].includes(referencedElement.tagName)) {
            for (const name of referencedElement.getAttributeNames()) {
              if (["id", "class", "style"].includes(name)) continue;
              if (!target.hasAttribute(name)) {
                targetAttributes.push([name, referencedElement.getAttribute(name)]);
              }
            }
            childrenToTraverse.push(...Array.from(referencedElement.childNodes));
          } else {
            childrenToTraverse.push(referencedElement);
          }
        }
      } else if (target instanceof HTMLSelectElement) {
        // Don't collect children of selects.
      } else if (child) {
        childrenToTraverse.push(child);
      }

      if (childrenToTraverse.length) {
        for (const traverseChild of childrenToTraverse) {
          if (!dryRun) await new Promise((resolve) => requestAnimationFrame(resolve));
          const result = await serialize(traverseChild, {
            abortSignal,
            dryRun,
            __isRoot: false,
            __processedNodes: __processedNodes + processedNodes,
          });
          processedNodes += result.processedNodes;
          if (!dryRun) children.push(result.html);
        }
      }
    }

    if (dryRun) return { html: "", processedNodes };

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      const shouldVerticallyCenterText = target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
      const placeholder = target instanceof HTMLSelectElement ? target.firstElementChild?.textContent : target.placeholder;

      if (target.type === "text" && target.value !== "") {
        const valueStyles = { height: "fit-content" };
        children.push(`<div style="${toInlineStyles(valueStyles)}">${target.value}</div>`);
        if (shouldVerticallyCenterText) styles["align-content"] = "center";
      } else if (placeholder) {
        const placeholderStyles = resolveComputedStyles(target, { pseudo: "::placeholder" });
        placeholderStyles.width = "100%";
        placeholderStyles.height = "fit-content";
        if (shouldVerticallyCenterText) {
          styles["align-content"] = "center";
          placeholderStyles["align-self"] = "center";
        }
        children.push(`<div style="${toInlineStyles(placeholderStyles)}">${placeholder}</div>`);
      }
    }

    const afterStyles = resolveComputedStyles(target, { pseudo: "::after" });
    if (Object.keys(afterStyles).length && !isScaledToZeroAndOutOfFlow(afterStyles)) {
      const afterText = resolvePseudoContent(target, "::after", afterStyles);
      delete afterStyles.content;
      const isInlineAfter = afterStyles.display === "inline" || afterStyles.display === "inline-block";
      const afterTag = isInlineAfter ? "span" : "div";
      children.push(`<${afterTag} style="${toInlineStyles(afterStyles)}">${encodeHTML(afterText)}</${afterTag}>`);
    }

    const attributesToSerialize = [];

    if (target instanceof HTMLImageElement) {
      attributesToSerialize.push(["src", target.src]);
      if (!styles.width && !styles.height) {
        const computedStyles = window.getComputedStyle(target);
        styles.width = computedStyles.width;
        styles.height = computedStyles.height;
      }
    }

    if (target instanceof HTMLBRElement) {
      return { html: "<br>", processedNodes };
    }

    const tableElements = ["table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col"];
    const inputs = ["input", "textarea"];
    const finalTagName = [...tableElements, ...inputs].includes(tagName) ? "div" : tagName;

    if (target instanceof SVGElement) {
      targetAttributes.forEach(([name, value]) => {
        if (["class", "style", "display", "overflow"].includes(name) || !value) return;
        if (["fill", "stroke", "color"].includes(name)) {
          if (value.startsWith("var(")) {
            const computedValue = styles[name];
            if (computedValue) value = computedValue;
          } else if (value.toLowerCase() === "currentcolor") {
            const computedValue = styles[name] ?? styles.color;
            if (computedValue) value = computedValue;
          }
        }
        attributesToSerialize.push([name, value.replaceAll('"', "'")]);
      });

      for (const [name] of attributesToSerialize) {
        if (["width", "height"].includes(name)) continue;
        delete styles[name];
      }
    }

    if (Object.keys(styles).length > 0) {
      if (styles.width || styles.height) {
        styles.width ??= "auto";
        styles.height ??= "auto";
      }
      attributesToSerialize.push(["style", toInlineStyles(styles)]);
    }

    // Preserve original class names:
    // - "class" for hover/focus CSS rules to work
    // - "data-class" for Claude Code to understand component structure
    const originalClass = target.getAttribute("class");
    if (originalClass) {
      const safeClass = originalClass.replaceAll('"', "'");
      attributesToSerialize.push(["class", safeClass]);
      attributesToSerialize.push(["data-class", safeClass]);
    }

    const isElementVisible = isChildOfSVG(target) || (target.checkVisibility() && styles.display !== "contents");
    if (isElementVisible) {
      const html = `<${finalTagName} ${attributesToSerialize.map(([key, value]) => `${key}="${value}"`).join(" ")}>${children.join("")}</${finalTagName}>`;
      return { html, processedNodes };
    }

    return { html: children.join(""), processedNodes };
  }

  const elementToSerialize = document.querySelector(selector);
  if (elementToSerialize) {
    const abortController = new AbortController();
    function keyDownHandler(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); abortController.abort(); }
    }
    window.addEventListener("keydown", keyDownHandler, { capture: true });

    setToastProgress(null);
    const dryRun = await serialize(elementToSerialize, { dryRun: true });
    totalNodesToProcess = dryRun.processedNodes;
    setToastProgress(0);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = await serialize(elementToSerialize, { abortSignal: abortController.signal });
    window.removeEventListener("keydown", keyDownHandler, { capture: true });

    if (abortController.signal.aborted) return { status: "aborted" };

    // Extract interactive CSS rules
    const interactiveCSS = extractInteractiveStyles(elementToSerialize);

    // Resolve @keyframes for every animation used in the captured subtree so the
    // pasted markup carries its motion (the editor's "Record CSS Anim" samples these).
    let capturedAnimationsStyle = "";
    try {
      capturedAnimationsStyle = await collectKeyframes(collectAnimationNames(elementToSerialize));
    } catch {}

    // Strip page-only positioning from root
    let rootHtml = result.html;
    rootHtml = rootHtml.replace(/^(<\w+\s[^>]*?)style="([^"]*)"/, (match, before, styleStr) => {
      const cleaned = styleStr
        .replace(/\bz-index:\s*[^;]+;?\s*/g, "")
        .replace(/\bpointer-events:\s*[^;]+;?\s*/g, "")
        .trim();
      return `${before}style="${cleaned}"`;
    });

    // RAW HTML version (for HTML viewers, paper.design, etc.)
    const rawHtml = rootHtml;

    // REACT JSX version for Claude Code / v0
    const jsxCode = htmlToJsx(simplifyStyles(rootHtml));
    let claudeOutput = `/**\n * UI Snapshot — Convert to React component.\n * Match the EXACT visual appearance: colors, spacing, typography, icons, layout.\n */\nexport default function CapturedComponent() {\n  return (\n${jsxCode}\n  );\n}\n`;

    return { status: "success", html: claudeOutput, rawHtml: rawHtml, capturedAnimationsStyle: capturedAnimationsStyle };
  }

  return { status: "error", error: "Element not found" };

  // Remove redundant CSS properties that duplicate shorthands or inherit from color
  function simplifyStyles(html) {
    // Properties to remove (they duplicate shorthand or are browser-internal)
    const redundantProps = new Set([
      "border-block-end-color", "border-block-start-color",
      "border-inline-end-color", "border-inline-start-color",
      "border-end-end-radius", "border-end-start-radius",
      "border-start-end-radius", "border-start-start-radius",
      "padding-block-end", "padding-block-start",
      "padding-inline-end", "padding-inline-start",
      "margin-block-end", "margin-block-start",
      "margin-inline-end", "margin-inline-start",
      "inline-size", "block-size",
      "caret-color", "column-rule-color", "text-emphasis-color",
      "-webkit-text-fill-color", "-webkit-text-stroke-color",
      "unicode-bidi", "-webkit-tap-highlight-color",
    ]);

    // Properties that duplicate `color` value — remove if same as color
    const colorDupes = new Set([
      "outline-color", "text-decoration-color",
    ]);

    return html.replace(/style="([^"]*)"/g, (match, styleStr) => {
      const props = {};
      let colorVal = null;

      // Parse into map
      for (const part of styleStr.split(";")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        const name = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (!name) continue;
        if (name === "color") colorVal = val;
        props[name] = val;
      }

      // Remove redundant
      for (const name of redundantProps) {
        delete props[name];
      }

      // Remove color duplicates that match `color`
      if (colorVal) {
        for (const name of colorDupes) {
          if (props[name] === colorVal) delete props[name];
        }
      }

      // Consolidate border-radius if all 4 corners are the same
      const br = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
      const brVals = br.map((p) => props[p]).filter(Boolean);
      if (brVals.length === 4 && new Set(brVals).size === 1) {
        props["border-radius"] = brVals[0];
        br.forEach((p) => delete props[p]);
      }

      // Rebuild
      const simplified = Object.entries(props)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      return `style="${simplified}"`;
    });
  }

  // Convert HTML with inline styles to React JSX with style objects
  function htmlToJsx(html) {
    // Convert rgb(r, g, b) to #RRGGBB
    function rgbToHex(rgb) {
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return rgb;
      const r = parseInt(m[1]).toString(16).padStart(2, "0");
      const g = parseInt(m[2]).toString(16).padStart(2, "0");
      const b = parseInt(m[3]).toString(16).padStart(2, "0");
      if (m[4] !== undefined && parseFloat(m[4]) < 1) {
        const a = Math.round(parseFloat(m[4]) * 255).toString(16).padStart(2, "0");
        return `#${r}${g}${b}${a}`.toUpperCase();
      }
      return `#${r}${g}${b}`.toUpperCase();
    }

    // Convert CSS property name to camelCase
    function toCamelCase(prop) {
      if (prop.startsWith("-webkit-")) return "Webkit" + prop.slice(8).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (prop.startsWith("-moz-")) return "Moz" + prop.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }

    // Convert CSS style string to JSX style object string
    function styleToJsx(styleStr) {
      const props = [];
      for (const part of styleStr.split(";")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        const name = part.slice(0, idx).trim();
        let val = part.slice(idx + 1).trim();
        if (!name || !val) continue;
        // Convert colors to hex
        val = val.replace(/rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*[\d.]+)?\)/g, rgbToHex);
        const camel = toCamelCase(name);
        props.push(`${camel}: '${val}'`);
      }
      return `{{ ${props.join(", ")} }}`;
    }

    // Convert HTML attributes to JSX
    let jsx = html;
    // Remove class and data-class attributes (noise for JSX)
    jsx = jsx.replace(/\s+(?:class|data-class)="[^"]*"/g, "");
    // Convert style="..." to style={{ ... }}
    jsx = jsx.replace(/style="([^"]*)"/g, (_, s) => `style={${styleToJsx(s)}}`);
    // HTML to JSX attribute conversions
    jsx = jsx.replace(/\bstroke-linejoin=/g, "strokeLinejoin=");
    jsx = jsx.replace(/\bstroke-width=/g, "strokeWidth=");
    jsx = jsx.replace(/\bfill-rule=/g, "fillRule=");
    jsx = jsx.replace(/\bclip-rule=/g, "clipRule=");
    jsx = jsx.replace(/\bdata-testid=/g, "data-testid=");
    jsx = jsx.replace(/\bfill-opacity=/g, "fillOpacity=");
    jsx = jsx.replace(/\bstroke-dasharray=/g, "strokeDasharray=");
    jsx = jsx.replace(/\bstroke-dashoffset=/g, "strokeDashoffset=");
    jsx = jsx.replace(/<hr(\s)/g, "<hr$1");
    jsx = jsx.replace(/<\/hr>/g, "");
    jsx = jsx.replace(/<hr([^/]*)(?<!\/)>/g, "<hr$1 />");
    jsx = jsx.replace(/<br>/g, "<br />");
    // Indent for readability
    jsx = "    " + jsx;
    return jsx;
  }

  // Scan stylesheets for :hover, :focus, :active rules that apply to captured elements.
  // Uses element.matches() for precise matching instead of class-name guessing.
  function extractInteractiveStyles(rootEl) {
    const interactivePseudos = [":hover", ":focus", ":active", ":focus-visible", ":focus-within"];
    const collectedRules = [];
    const allElements = [rootEl, ...rootEl.querySelectorAll("*")];
    const seen = new Set();

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue;
          const sel = rule.selectorText;
          if (!sel || seen.has(sel)) continue;

          // Must contain an interactive pseudo-class
          const hasInteractive = interactivePseudos.some((p) => sel.includes(p));
          if (!hasInteractive) continue;

          // Strip pseudo-classes to get the base selector for matching
          let baseSelector = sel;
          for (const p of interactivePseudos) {
            baseSelector = baseSelector.replaceAll(p, "");
          }
          // Clean up double colons, empty parens
          baseSelector = baseSelector.replace(/::?(?=[,\s{]|$)/g, "").trim();
          if (!baseSelector) continue;

          // Check if any element in our subtree matches the base selector
          let matches = false;
          try {
            for (const el of allElements) {
              if (el.matches && el.matches(baseSelector)) {
                matches = true;
                break;
              }
            }
          } catch (e) {
            // Invalid selector — skip
            continue;
          }
          if (!matches) continue;

          seen.add(sel);
          // Keep original selector with class names (data-class won't work for hover in CSS)
          // Instead, re-add class attributes temporarily when rendering preview
          collectedRules.push(`${sel} { ${rule.style.cssText} }`);

          // Cap at 50 rules to avoid bloating the output
          if (collectedRules.length >= 50) break;
        }
      } catch (e) {
        // Cross-origin stylesheet — skip
      }
      if (collectedRules.length >= 50) break;
    }

    return collectedRules.length > 0 ? collectedRules.join(" ") : "";
  }
}

// ============================================================================
// TOAST — Simplified from Paper Snapshot: toast.ts
// Changes: element names, CSS var names
// ============================================================================
function showToast(messageHTML, { iconColor = "#6366f1", dismissTimeout = 5000, hideOnHover = false, showProgressBar = false, messageClassName = "" } = {}) {
  const existing = document.querySelector("#ui2code-toast-wrapper");
  const wrapper = existing || document.createElement("div");
  wrapper.id = "ui2code-toast-wrapper";
  wrapper.removeAttribute("data-removing");
  wrapper.setAttribute("data-timeout", String(dismissTimeout));

  if (existing) {
    const toastCustomEl = existing.querySelector("ui2code-toast");
    if (toastCustomEl) {
      const shadow = toastCustomEl.shadowRoot;
      if (shadow) {
        const msgWrapper = shadow.querySelector(".toast__message-wrapper");
        if (msgWrapper) {
          const items = Array.from(msgWrapper.querySelectorAll(".toast__message-item"));
          if (messageClassName && items.find((i) => i.classList.contains(messageClassName))) {
            const toastEl = shadow.querySelector(".toast");
            toastEl.getAnimations().forEach((a) => a.cancel());
            toastEl.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }], { duration: 500, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
            existing.setAttribute("data-timeout", String(dismissTimeout));
            existing.removeAttribute("data-removing");
            return;
          }
          items.forEach((item) => {
            const onEnd = () => { item.removeEventListener("transitionend", onEnd); item.remove(); };
            item.addEventListener("transitionend", onEnd, { once: true });
            item.style.transform = "translate(-50%, -24px)";
          });
          const newItem = document.createElement("div");
          newItem.className = `toast__message-item${messageClassName ? ` ${messageClassName}` : ""}`;
          newItem.innerHTML = messageHTML;
          msgWrapper.appendChild(newItem);
          requestAnimationFrame(() => { requestAnimationFrame(() => {
            const allItems = msgWrapper.querySelectorAll(".toast__message-item");
            const last = allItems[allItems.length - 1];
            if (last) { const w = Math.max(last.offsetWidth, last.scrollWidth, last.getBoundingClientRect().width); msgWrapper.style.width = `${w}px`; }
          }); });
        }
        const svgPath = shadow.querySelector("svg path");
        if (svgPath) svgPath.setAttribute("fill", iconColor);
        const toastEl = shadow.querySelector(".toast");
        if (toastEl) { hideOnHover ? toastEl.setAttribute("data-hide-on-hover", "") : toastEl.removeAttribute("data-hide-on-hover"); }
        const progressBar = shadow.querySelector(".toast__progress");
        if (showProgressBar && !progressBar) {
          const bar = document.createElement("div"); bar.className = "toast__progress";
          const t = shadow.querySelector(".toast"); if (t) t.insertBefore(bar, t.firstChild);
        } else if (!showProgressBar && progressBar) {
          const onEnd = () => { progressBar.removeEventListener("transitionend", onEnd); progressBar.remove(); };
          progressBar.addEventListener("transitionend", onEnd, { once: true }); progressBar.style.opacity = "0";
        }
        return;
      }
    }
  }

  wrapper.setHTMLUnsafe(`
    <ui2code-toast>
      <template shadowrootmode="open">
        <style>
          *:not(svg *, style, span) { all: initial; }
          kbd { align-items: center; background-color: rgb(252, 252, 249); border-radius: 3px; box-shadow: inset 0 -.05em .5em #00000006, inset 0 .05em #fffffff2, inset 0 .25em .5em #00000006, inset 0 -.05em #00000026, 0 0 0 .05em #0000001f, 0 .08em .17em #0003; box-sizing: border-box; color: oklab(0 0 0 / 0.8); display: inline-flex; font-family: -apple-system, 'system-ui', system-ui, sans-serif; font-size: 12px; line-height: 1; height: 20px; justify-content: center; margin-inline: 2px; padding: 0 4px; min-width: 20px; }
          [data-hide-on-hover] { opacity: 1; } [data-hide-on-hover]:hover { opacity: 0; }
          .toast { box-sizing: border-box; position: relative; display: flex; align-items: center; contain: content; height: 48px; background-color: rgb(255 255 255); --popup-radius: 8px; border-radius: var(--popup-radius); box-shadow: rgb(0 0 0 / 25%) 0px 4px 20px -4px, rgb(0 0 0 / 10%) 0px 0px 0px 1px; font-synthesis: none; pointer-events: auto; transition: opacity 350ms ease, scale 350ms cubic-bezier(0.34, 1.56, 0.64, 1), translate 350ms cubic-bezier(0.34, 1.56, 0.64, 1); transform-origin: top center; @starting-style { opacity: 0; scale: 0.98; translate: 0 -24px; } }
          .toast.animate-out { opacity: 0; translate: 0 -16px; scale: 0.98; transition: opacity 150ms ease-in, scale 150ms ease-in, translate 150ms ease-in; }
          .toast__placement { position: fixed; left: 0; right: 0; top: 16px; display: flex; justify-content: center; pointer-events: none; user-select: none; z-index: calc(infinity); }
          .toast__message { align-items: center; box-sizing: border-box; display: flex; flex-direction: column; flex-shrink: 0; height: 100%; overflow: hidden; position: relative; padding-right: 20px; padding-left: 50px; }
          .toast__message-wrapper { height: 100%; position: relative; transition: width 500ms cubic-bezier(0, 0.9, 0.2, 1); will-change: width; }
          .toast__message-item { align-items: center; display: flex; gap: 4px; height: 100%; justify-content: center; left: 50%; position: absolute; top: 0; transform: translateX(-50%); width: fit-content; color: oklab(0% 0 0 / 80%); font-size: 14px; font-family: system-ui, sans-serif; -moz-osx-font-smoothing: grayscale; -webkit-font-smoothing: antialiased; line-height: 16px; text-wrap-mode: nowrap; transition: transform 250ms cubic-bezier(0.33, 1, 0.68, 1), opacity 250ms ease-out, filter 250ms ease-out; }
          .toast__message-item:not(:first-child) { @starting-style { opacity: 0; filter: blur(4px); transform: translate(-50%, 24px); } }
          .toast__message-item:not(:last-child) { opacity: 0; filter: blur(4px); }
          .toast__message-item span.dot { margin: 0 4px; opacity: 0.4; }
          .toast__message-item.capturing { gap: 0px; }
          .toast__message-item.capturing::after { color: oklab(0% 0 0 / 60%); content: var(--ui2code-suffix, ""); font-variant-numeric: tabular-nums; width: var(--ui2code-suffix-width, 0); text-align: right; }
          .toast__progress { background-color: rgb(0 0 0 / 3.5%); inset: 0; position: absolute; scale: calc(var(--ui2code-progress, 0) / 100) 1; transform-origin: left; transition: scale 250ms ease-out, opacity 150ms ease-out; }
          .toast__progress.no-transition { transition: none; }
          svg { position: absolute; left: 19px; transition: fill 250ms ease-out; z-index: 1; }
          @media (prefers-color-scheme: dark) {
            .toast { background-color: rgb(28 28 30); box-shadow: rgb(0 0 0 / 40%) 0px 4px 20px -4px, rgb(0 0 0 / 30%) 0px 0px 0px 1px, inset 0 0.5px 0 rgb(255 255 255 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.9); }
            .toast__message-item { color: oklab(100% 0 0 / 90%); }
            .toast__message-item.capturing::after { color: oklab(100% 0 0 / 70%); }
            .toast__progress { background-color: rgb(255 255 255 / 5%); }
            kbd { background-color: rgb(44 44 46); box-shadow: inset 0 -.05em .5em #00000020, inset 0 .05em #ffffff08, inset 0 .25em .5em #00000020, inset 0 -.05em #00000040, 0 0 0 .05em #00000030, 0 .08em .17em #0006; color: oklab(100% 0 0 / 0.9); }
          }
        </style>
        <div class="toast__placement">
          <div class="toast" ${hideOnHover ? "data-hide-on-hover" : ""}>
            ${showProgressBar ? '<div class="toast__progress"></div>' : ""}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" fill="${iconColor}"/>
            </svg>
            <div class="toast__message">
              <div class="toast__message-wrapper">
                <div class="toast__message-item${messageClassName ? ` ${messageClassName}` : ""}">
                  ${messageHTML}
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </ui2code-toast>
  `);

  if (!wrapper.parentElement) {
    document.body.appendChild(wrapper);
    requestAnimationFrame(() => { requestAnimationFrame(() => {
      const toastCustomEl = wrapper.querySelector("ui2code-toast");
      if (toastCustomEl) {
        const shadow = toastCustomEl.shadowRoot;
        if (shadow) {
          const msgWrapper = shadow.querySelector(".toast__message-wrapper");
          const item = shadow.querySelector(".toast__message-item");
          if (msgWrapper && item) {
            const w = Math.max(item.offsetWidth, item.scrollWidth, item.getBoundingClientRect().width);
            msgWrapper.style.width = `${w}px`;
          }
        }
      }
    }); });
  }
}

function dismissToast({ immediate = false } = {}) {
  const wrapper = document.querySelector("#ui2code-toast-wrapper");
  if (!(wrapper instanceof HTMLElement)) return;
  if (wrapper.hasAttribute("data-removing")) return;
  const timeout = immediate ? 0 : Number(wrapper.getAttribute("data-timeout") || "0");
  const toastEl = wrapper.querySelector("ui2code-toast")?.shadowRoot?.querySelector(".toast");
  if (!toastEl) return;
  const doRemove = () => {
    const onEnd = () => { toastEl.removeEventListener("transitionend", onEnd); wrapper.remove(); };
    toastEl.addEventListener("transitionend", onEnd);
  };
  if (timeout === 0) { toastEl.classList.add("animate-out"); doRemove(); }
  else {
    const id = Date.now().toString(36);
    wrapper.setAttribute("data-removing", id);
    window.addEventListener("mousemove", () => {
      setTimeout(() => { if (wrapper.getAttribute("data-removing") === id) { toastEl.classList.add("animate-out"); doRemove(); } }, timeout);
    }, { once: true });
  }
}

// ============================================================================
// PROCESSING INDICATOR — Direct port from Paper Snapshot: processing-indicator.ts
// ============================================================================
function showProcessingIndicator(selector) {
  const BLANKET_ID = "ui2code-blanket";
  const INDICATOR_ID = "ui2code-indicator";
  const PICKER_ID = "ui2code-picker-outline";
  const STYLES_ID = "ui2code-indicator-styles";

  [BLANKET_ID, PICKER_ID, INDICATOR_ID, STYLES_ID].forEach((id) => document.getElementById(id)?.remove());

  const el = document.querySelector(selector);
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const top = Math.max(0, rect.top + window.scrollY);
  const left = Math.max(0, rect.left + window.scrollX);
  const maxW = document.body.clientWidth - left;
  const maxH = document.body.clientHeight - top;
  const width = Math.min(rect.width, maxW);
  const height = Math.min(rect.height, maxH);
  const borderRadius = getComputedStyle(el).borderRadius;

  const styles = document.createElement("style");
  styles.id = STYLES_ID;
  styles.textContent = `
    @keyframes __ui2code-spin { to { transform: rotate(360deg); } }
    @keyframes __ui2code-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes __ui2code-fade-out { from { opacity: 1; } to { opacity: 0; } }
  `;
  document.head.appendChild(styles);

  const indicator = document.createElement("div");
  indicator.id = INDICATOR_ID;
  Object.assign(indicator.style, { animation: "__ui2code-fade-in 300ms ease-in forwards", borderRadius: borderRadius || "0px", boxSizing: "border-box", height: `${height}px`, left: `${left}px`, maskComposite: "exclude", overflow: "hidden", padding: "2px", pointerEvents: "none", position: "absolute", top: `${top}px`, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", width: `${width}px`, zIndex: "calc(infinity)" });

  const diameter = Math.ceil(Math.sqrt(width * width + height * height));
  const spinner = document.createElement("div");
  Object.assign(spinner.style, { animation: "__ui2code-spin 2500ms linear infinite", background: "conic-gradient(#6366f1 0%, rgba(99,102,241,0.3) 25%, #6366f1 50%, rgba(99,102,241,0.3) 75%, #6366f1 100%)", borderRadius: "50%", height: `${diameter}px`, left: "50%", marginLeft: `${-diameter / 2}px`, marginTop: `${-diameter / 2}px`, position: "absolute", top: "50%", width: `${diameter}px`, willChange: "transform" });
  indicator.appendChild(spinner);

  const pickerOutline = document.createElement("div");
  pickerOutline.id = PICKER_ID;
  Object.assign(pickerOutline.style, { animation: "__ui2code-fade-out 300ms ease-out forwards", border: "2px solid oklch(0.7 0.15 258)", borderRadius: borderRadius || "0px", boxSizing: "border-box", height: `${height}px`, left: `${left}px`, pointerEvents: "none", position: "absolute", top: `${top}px`, width: `${width}px`, zIndex: "calc(infinity)" });

  const blanket = document.createElement("div");
  blanket.id = BLANKET_ID;
  Object.assign(blanket.style, { position: "fixed", inset: "0", zIndex: "calc(infinity)", cursor: "wait" });

  document.body.appendChild(blanket);
  document.body.appendChild(pickerOutline);
  document.body.appendChild(indicator);
}

function hideProcessingIndicator() {
  const indicator = document.getElementById("ui2code-indicator");
  if (!indicator) return;
  indicator.style.animation = "__ui2code-fade-out 200ms ease-in forwards";
  const cleanup = () => { ["ui2code-blanket", "ui2code-indicator", "ui2code-picker-outline", "ui2code-indicator-styles"].forEach((id) => document.getElementById(id)?.remove()); };
  indicator.addEventListener("transitionend", cleanup, { once: true });
  setTimeout(cleanup, 300);
}

// ============================================================================
// FOCUS PROMPT — Direct port from Paper Snapshot: click-to-start.ts
// ============================================================================
function clickToStartOverlay() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", backdropFilter: "saturate(1.5)" });
    const label = document.createElement("div");
    Object.assign(label.style, { background: "rgba(0,0,0,0.82)", color: "rgba(255,255,255,0.9)", padding: "8px 16px", borderRadius: "10px", font: "500 13px/1.4 -apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif", pointerEvents: "none", boxShadow: "0 4px 20px -4px rgba(0,0,0,0.6)", letterSpacing: "-0.01em" });
    label.textContent = "Click to start selecting an element";
    overlay.appendChild(label);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", () => { overlay.remove(); resolve(); }, { once: true });
  });
}

// ============================================================================
// PREVIEW — Show captured HTML in overlay using Shadow DOM (same page context)
// This ensures fonts, SVGs, and color context render correctly
// ============================================================================
function showPreview(html, jsxCode) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.id = "ui2code-preview-backdrop";
    Object.assign(backdrop.style, { position: "fixed", inset: "0", zIndex: "2147483647", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif", opacity: "0", transition: "opacity 200ms ease-out" });

    const panel = document.createElement("div");
    Object.assign(panel.style, { background: "#1c1c1e", borderRadius: "16px", boxShadow: "0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", maxWidth: "90vw", maxHeight: "90vh", minWidth: "480px", minHeight: "360px", width: "75vw", height: "80vh", overflow: "hidden", transform: "scale(0.96) translateY(8px)", transition: "transform 250ms cubic-bezier(0.34,1.56,0.64,1)" });

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: "0" });
    const title = document.createElement("div");
    Object.assign(title.style, { color: "rgba(255,255,255,0.9)", fontSize: "14px", fontWeight: "600", letterSpacing: "-0.01em" });
    title.textContent = "Preview Captured Element";
    const headerRight = document.createElement("div");
    Object.assign(headerRight.style, { display: "flex", gap: "8px", alignItems: "center" });
    const sizeLabel = document.createElement("div");
    Object.assign(sizeLabel.style, { color: "rgba(255,255,255,0.4)", fontSize: "12px", fontVariantNumeric: "tabular-nums", marginRight: "8px" });
    sizeLabel.textContent = `${(new Blob([html]).size / 1024).toFixed(1)} KB`;

    const cancelBtn = document.createElement("button");
    Object.assign(cancelBtn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "13px", fontWeight: "500", padding: "6px 16px", fontFamily: "inherit", transition: "all 150ms ease" });
    cancelBtn.textContent = "Cancel";
    cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255,255,255,0.12)"; cancelBtn.style.color = "rgba(255,255,255,0.9)"; };
    cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255,255,255,0.08)"; cancelBtn.style.color = "rgba(255,255,255,0.7)"; };

    const copyPaperBtn = document.createElement("button");
    Object.assign(copyPaperBtn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "500", padding: "6px 12px", fontFamily: "inherit", transition: "all 150ms ease" });
    copyPaperBtn.textContent = "Copy for Paper";
    copyPaperBtn.title = "Copy as Paper-compatible snapshot (paste directly into Paper app)";
    copyPaperBtn.onmouseenter = () => { copyPaperBtn.style.background = "rgba(255,255,255,0.14)"; copyPaperBtn.style.color = "rgba(255,255,255,0.9)"; };
    copyPaperBtn.onmouseleave = () => { copyPaperBtn.style.background = "rgba(255,255,255,0.08)"; copyPaperBtn.style.color = "rgba(255,255,255,0.7)"; };

    const copyOpenPencilBtn = document.createElement("button");
    Object.assign(copyOpenPencilBtn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "500", padding: "6px 12px", fontFamily: "inherit", transition: "all 150ms ease" });
    copyOpenPencilBtn.textContent = "Copy for OpenPencil";
    copyOpenPencilBtn.title = "Copy as OpenPencil-compatible snapshot (paste directly into OpenPencil app)";
    copyOpenPencilBtn.onmouseenter = () => { copyOpenPencilBtn.style.background = "rgba(255,255,255,0.14)"; copyOpenPencilBtn.style.color = "rgba(255,255,255,0.9)"; };
    copyOpenPencilBtn.onmouseleave = () => { copyOpenPencilBtn.style.background = "rgba(255,255,255,0.08)"; copyOpenPencilBtn.style.color = "rgba(255,255,255,0.7)"; };

    const copyFigmaBtn = document.createElement("button");
    Object.assign(copyFigmaBtn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "500", padding: "6px 12px", fontFamily: "inherit", transition: "all 150ms ease" });
    copyFigmaBtn.textContent = "Copy for Figma";
    copyFigmaBtn.title = "Copy as SVG for Figma (paste into canvas with Cmd+V)";
    copyFigmaBtn.onmouseenter = () => { copyFigmaBtn.style.background = "rgba(255,255,255,0.14)"; copyFigmaBtn.style.color = "rgba(255,255,255,0.9)"; };
    copyFigmaBtn.onmouseleave = () => { copyFigmaBtn.style.background = "rgba(255,255,255,0.08)"; copyFigmaBtn.style.color = "rgba(255,255,255,0.7)"; };

    // TODO: Lottielab copy disabled — clipboard format needs more investigation
    // const copyLottielabBtn = document.createElement("button");
    // Object.assign(copyLottielabBtn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "500", padding: "6px 12px", fontFamily: "inherit", transition: "all 150ms ease" });
    // copyLottielabBtn.textContent = "Copy for Lottielab";
    // copyLottielabBtn.title = "Copy as Lottielab image layer (paste into editor with Cmd+V)";
    // copyLottielabBtn.onmouseenter = () => { copyLottielabBtn.style.background = "rgba(255,255,255,0.14)"; copyLottielabBtn.style.color = "rgba(255,255,255,0.9)"; };
    // copyLottielabBtn.onmouseleave = () => { copyLottielabBtn.style.background = "rgba(255,255,255,0.08)"; copyLottielabBtn.style.color = "rgba(255,255,255,0.7)"; };

    const copyJitterBtn = document.createElement("button");
    Object.assign(copyJitterBtn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "500", padding: "6px 12px", fontFamily: "inherit", transition: "all 150ms ease" });
    copyJitterBtn.textContent = "Copy for Jitter";
    copyJitterBtn.title = "Copy as Jitter layers (paste into timeline with Cmd+V)";
    copyJitterBtn.onmouseenter = () => { copyJitterBtn.style.background = "rgba(255,255,255,0.14)"; copyJitterBtn.style.color = "rgba(255,255,255,0.9)"; };
    copyJitterBtn.onmouseleave = () => { copyJitterBtn.style.background = "rgba(255,255,255,0.08)"; copyJitterBtn.style.color = "rgba(255,255,255,0.7)"; };

    const copyRawBtn = document.createElement("button");
    Object.assign(copyRawBtn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "500", padding: "6px 12px", fontFamily: "inherit", transition: "all 150ms ease" });
    copyRawBtn.textContent = "Copy React CSS";
    copyRawBtn.title = "Copy React CSS source (for React component conversion)";
    copyRawBtn.onmouseenter = () => { copyRawBtn.style.background = "rgba(255,255,255,0.14)"; copyRawBtn.style.color = "rgba(255,255,255,0.9)"; };
    copyRawBtn.onmouseleave = () => { copyRawBtn.style.background = "rgba(255,255,255,0.08)"; copyRawBtn.style.color = "rgba(255,255,255,0.7)"; };

    const copyAIBtn = document.createElement("button");
    Object.assign(copyAIBtn.style, { background: "#6366f1", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: "600", padding: "6px 14px", fontFamily: "inherit", transition: "all 150ms ease", boxShadow: "0 1px 3px rgba(99,102,241,0.3)" });
    copyAIBtn.textContent = "Copy for Claude/v0";
    copyAIBtn.title = "Copy simplified + annotated HTML for AI tools";
    copyAIBtn.onmouseenter = () => { copyAIBtn.style.background = "#818cf8"; };
    copyAIBtn.onmouseleave = () => { copyAIBtn.style.background = "#6366f1"; };

    headerRight.append(sizeLabel, cancelBtn, copyPaperBtn, copyOpenPencilBtn, copyFigmaBtn, copyJitterBtn, /* copyLottielabBtn, */ copyRawBtn, copyAIBtn);
    header.append(title, headerRight);

    // Toolbar with zoom controls
    const toolbar = document.createElement("div");
    Object.assign(toolbar.style, { display: "flex", alignItems: "center", gap: "8px", padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: "0" });

    let zoom = 100;
    const zoomLabel = document.createElement("span");
    Object.assign(zoomLabel.style, { color: "rgba(255,255,255,0.5)", fontSize: "12px", fontVariantNumeric: "tabular-nums", minWidth: "40px", textAlign: "center" });
    zoomLabel.textContent = "100%";

    function makeBtn(text, title) {
      const btn = document.createElement("button");
      Object.assign(btn.style, { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "13px", fontWeight: "600", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", fontFamily: "inherit", transition: "all 150ms ease" });
      btn.textContent = text;
      btn.title = title;
      btn.onmouseenter = () => { btn.style.background = "rgba(255,255,255,0.14)"; };
      btn.onmouseleave = () => { btn.style.background = "rgba(255,255,255,0.08)"; };
      return btn;
    }

    const zoomOutBtn = makeBtn("\u2212", "Zoom out");
    const zoomInBtn = makeBtn("+", "Zoom in");
    const fitBtn = makeBtn("\u2922", "Fit to view");

    function updateZoom() {
      zoomLabel.textContent = `${zoom}%`;
      previewHost.style.transform = `scale(${zoom / 100})`;
      previewHost.style.transformOrigin = "top center";
    }

    zoomOutBtn.addEventListener("click", () => { zoom = Math.max(25, zoom - 25); updateZoom(); });
    zoomInBtn.addEventListener("click", () => { zoom = Math.min(300, zoom + 25); updateZoom(); });
    fitBtn.addEventListener("click", () => {
      // Auto-fit: calculate zoom to fit content in view
      const scrollerRect = previewScroller.getBoundingClientRect();
      const hostRect = previewHost.getBoundingClientRect();
      if (hostRect.width > 0 && hostRect.height > 0) {
        const currentScale = zoom / 100;
        const realW = hostRect.width / currentScale;
        const realH = hostRect.height / currentScale;
        const fitW = (scrollerRect.width - 48) / realW;
        const fitH = (scrollerRect.height - 48) / realH;
        zoom = Math.round(Math.min(fitW, fitH, 1) * 100 / 25) * 25;
        zoom = Math.max(25, Math.min(300, zoom));
      } else {
        zoom = 100;
      }
      updateZoom();
    });

    const zoomLabelText = document.createElement("span");
    Object.assign(zoomLabelText.style, { color: "rgba(255,255,255,0.4)", fontSize: "12px" });
    zoomLabelText.textContent = "Zoom:";

    // Tab bar: Visual Preview | React JSX
    const tabBar = document.createElement("div");
    Object.assign(tabBar.style, { display: "flex", gap: "0", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: "0" });

    let activeTab = "visual";
    function makeTab(label, id) {
      const tab = document.createElement("button");
      Object.assign(tab.style, { background: "none", border: "none", borderBottom: "2px solid transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "13px", fontWeight: "500", padding: "10px 20px", fontFamily: "inherit", transition: "all 150ms ease" });
      tab.textContent = label;
      tab.dataset.tab = id;
      tab.addEventListener("click", () => switchTab(id));
      return tab;
    }
    const visualTab = makeTab("Visual Preview", "visual");
    const jsxTab = makeTab("React JSX", "jsx");
    tabBar.append(visualTab, jsxTab);

    // Zoom toolbar (only visible in visual tab)
    toolbar.append(zoomLabelText, zoomOutBtn, zoomLabel, zoomInBtn, fitBtn);

    // Visual preview container
    const previewScroller = document.createElement("div");
    Object.assign(previewScroller.style, { flex: "1", overflow: "auto", position: "relative", background: "#1a1a1a" });

    const previewHost = document.createElement("div");
    Object.assign(previewHost.style, { minHeight: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "24px", boxSizing: "border-box", transition: "transform 150ms ease" });
    const shadow = previewHost.attachShadow({ mode: "open" });
    const pageColorScheme = window.getComputedStyle(document.documentElement).colorScheme ||
                            window.getComputedStyle(document.body).colorScheme || "normal";
    shadow.innerHTML = `<style>
      :host { display: contents; color-scheme: ${pageColorScheme}; }
      *, *::before, *::after { box-sizing: border-box; }
    </style>${html}`;
    previewScroller.appendChild(previewHost);

    previewScroller.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom = Math.max(25, Math.min(300, zoom + (e.deltaY < 0 ? 10 : -10)));
        updateZoom();
      }
    }, { passive: false });

    // JSX code preview container
    const jsxScroller = document.createElement("div");
    Object.assign(jsxScroller.style, { flex: "1", overflow: "auto", position: "relative", background: "#0d1117", display: "none" });

    const jsxPre = document.createElement("pre");
    Object.assign(jsxPre.style, { margin: "0", padding: "20px", color: "#e6edf3", fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace", fontSize: "12px", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-all", tabSize: "2" });
    jsxPre.textContent = jsxCode || "(JSX code will appear here)";
    jsxScroller.appendChild(jsxPre);

    function switchTab(tab) {
      activeTab = tab;
      if (tab === "visual") {
        previewScroller.style.display = ""; jsxScroller.style.display = "none"; toolbar.style.display = "flex";
        visualTab.style.color = "rgba(255,255,255,0.9)"; visualTab.style.borderBottomColor = "#6366f1";
        jsxTab.style.color = "rgba(255,255,255,0.5)"; jsxTab.style.borderBottomColor = "transparent";
      } else {
        previewScroller.style.display = "none"; jsxScroller.style.display = ""; toolbar.style.display = "none";
        jsxTab.style.color = "rgba(255,255,255,0.9)"; jsxTab.style.borderBottomColor = "#6366f1";
        visualTab.style.color = "rgba(255,255,255,0.5)"; visualTab.style.borderBottomColor = "transparent";
      }
    }
    switchTab("visual"); // Set initial state

    // Footer
    const footer = document.createElement("div");
    Object.assign(footer.style, { padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", fontSize: "12px", textAlign: "center", flexShrink: "0" });
    footer.textContent = "Ctrl+scroll to zoom  \u00b7  Enter to copy for Claude/v0";

    panel.append(header, tabBar, toolbar, previewScroller, jsxScroller, footer);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
      backdrop.style.opacity = "1";
      panel.style.transform = "scale(1) translateY(0)";
    });

    function close(action) {
      backdrop.style.opacity = "0";
      panel.style.transform = "scale(0.96) translateY(8px)";
      panel.style.transition = "transform 150ms ease-in";
      backdrop.style.transition = "opacity 150ms ease-in";
      setTimeout(() => { backdrop.remove(); resolve(action); }, 160);
    }

    cancelBtn.addEventListener("click", () => close("cancel"));
    copyPaperBtn.addEventListener("click", () => close("copy-paper"));
    copyOpenPencilBtn.addEventListener("click", () => close("copy-openpencil"));
    copyFigmaBtn.addEventListener("click", () => close("copy-figma"));
    copyJitterBtn.addEventListener("click", () => close("copy-jitter"));
    // copyLottielabBtn.addEventListener("click", () => close("copy-lottielab"));
    copyRawBtn.addEventListener("click", () => close("copy-raw"));
    copyAIBtn.addEventListener("click", () => close("copy-ai"));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close("cancel"); });

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); document.removeEventListener("keydown", onKey, { capture: true }); close("cancel"); }
      if (e.key === "Enter") { e.preventDefault(); document.removeEventListener("keydown", onKey, { capture: true }); close("copy-ai"); }
    }
    document.addEventListener("keydown", onKey, { capture: true });
  });
}

// ============================================================================
// BACKGROUND SERVICE WORKER — Orchestration
// ============================================================================
chrome.action.onClicked.addListener(async (tab) => {
  // Guard: skip restricted URLs that extensions can't access
  const url = tab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.startsWith("chrome-extension://") || url.startsWith("extension://")) {
    console.warn("UI to Code Snapshot: Cannot run on restricted page:", url);
    return;
  }

  await chrome.action.disable(tab.id);

  try {
    const [focusResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.hasFocus(),
    });

    if (focusResult?.result === false) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clickToStartOverlay,
      });
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showToast,
      args: [
        'Click or <kbd>\u21b5</kbd> to capture <span class="dot">\u00b7</span> <span><kbd>\u2191</kbd><kbd>\u2193</kbd></span> to fine-tune <span class="dot">\u00b7</span> <kbd>esc</kbd> to cancel',
        { dismissTimeout: 0, hideOnHover: true, messageClassName: "initial" },
      ],
    });

    chrome.scripting.executeScript(
      { target: { tabId: tab.id, allFrames: true }, func: elementPicker },
      async (results) => {
        try {
          const result = results?.find((res) => !!res.result);

          if (result) {
            const frameId = result.frameId;
            const selector = result.result;

            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: showProcessingIndicator,
              args: [selector],
            });

            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: showToast,
              args: ["Capturing selection...", { iconColor: "#CCCCCC", showProgressBar: true, messageClassName: "capturing" }],
            });

            const [serializedHTML] = await Promise.all([
              chrome.scripting.executeScript({
                target: { tabId: tab.id, frameIds: [frameId] },
                func: elementSerializer,
                args: [selector],
              }),
              new Promise((resolve) => setTimeout(resolve, 500)),
            ]);

            const serializationResult = serializedHTML?.[0]?.result;

            if (serializationResult?.status === "success") {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: dismissToast,
                args: [{ immediate: true }],
              });

              const [previewResult] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: showPreview,
                args: [serializationResult.rawHtml, serializationResult.html],
              });

              const action = previewResult?.result;
              if (action === "copy-ai") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboard,
                  args: [serializationResult.html],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied for Claude/v0! Paste to generate React components."],
                });
              } else if (action === "copy-paper") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboardForPaper,
                  args: [(serializationResult.capturedAnimationsStyle || "") + serializationResult.rawHtml],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied for Paper! Paste into Paper app."],
                });
              } else if (action === "copy-openpencil") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboardForOpenPencil,
                  args: [(serializationResult.capturedAnimationsStyle || "") + serializationResult.rawHtml],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied for OpenPencil! Paste into OpenPencil app with Cmd+V."],
                });
              } else if (action === "copy-figma") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboardForFigma,
                  args: [serializationResult.rawHtml],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied as SVG for Figma! Paste into canvas with Cmd+V."],
                });
              } else if (action === "copy-jitter") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboardForJitter,
                  args: [serializationResult.rawHtml],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied for Jitter! Paste into timeline with Cmd+V."],
                });
              } else if (action === "copy-lottielab") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboardForLottielab,
                  args: [serializationResult.rawHtml],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied for Lottielab! Paste into editor with Cmd+V."],
                });
              } else if (action === "copy-raw") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboard,
                  args: [(serializationResult.capturedAnimationsStyle || "") + serializationResult.rawHtml],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied raw HTML!"],
                });
              } else {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Cancelled", { iconColor: "#CCCCCC", dismissTimeout: 2000 }],
                });
              }
            } else if (serializationResult?.status === "error") {
              console.error("Serialization error:", serializationResult.error);
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: showToast,
                args: ["An error occurred", { iconColor: "#CCCCCC" }],
              });
            } else if (serializationResult?.status === "aborted") {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: dismissToast,
                args: [{ immediate: true }],
              });
            } else {
              console.error("Serialization failed — no result returned");
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: showToast,
                args: ["Capture failed. Try selecting a different element.", { iconColor: "#CCCCCC" }],
              });
            }

            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: hideProcessingIndicator,
            });
          }

          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: dismissToast,
          });
        } catch (err) {
          console.error("UI to Code Snapshot error:", err);
        } finally {
          await chrome.action.enable(tab.id);
        }
      }
    );
  } catch (err) {
    console.error("UI to Code Snapshot: Cannot access page:", err.message);
    await chrome.action.enable(tab.id);
  }
});
