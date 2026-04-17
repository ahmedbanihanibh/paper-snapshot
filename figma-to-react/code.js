// Figma to React Exporter
// Converts selected Figma nodes (or the current page) into a self-contained
// React component using inline style objects. Images are exported as base64
// data URLs so the output is a single .tsx file with no asset dependencies.

figma.showUI(__html__, { width: 460, height: 640 });

// ---------- utilities ----------

function sanitizeName(name) {
  if (!name) return "Component";
  let n = name.replace(/[^a-zA-Z0-9]/g, " ").trim();
  if (!n) return "Component";
  n = n
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  if (/^[0-9]/.test(n)) n = "C" + n;
  return n;
}

function rgbToCss(c, a) {
  const r = Math.round((c.r || 0) * 255);
  const g = Math.round((c.g || 0) * 255);
  const b = Math.round((c.b || 0) * 255);
  const alpha = a == null ? 1 : a;
  if (alpha >= 1) {
    const toHex = (v) => v.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
}

// Compute CSS linear-gradient angle (in degrees, CSS convention: 0° = up, clockwise)
// from Figma's 2x3 gradientTransform matrix.
function linearGradientAngle(gt) {
  if (!gt || gt.length < 2) return 180;
  const a = gt[0][0], b = gt[0][1], c = gt[0][2];
  const d = gt[1][0], e = gt[1][1], f = gt[1][2];
  const det = a * e - b * d;
  if (!isFinite(det) || Math.abs(det) < 1e-10) return 180;
  // inverse 2x3 affine
  const ia = e / det, ib = -b / det;
  const id = -d / det, ie = a / det;
  const ic = -(ia * c + ib * f);
  const iF = -(id * c + ie * f);
  // gradient line start = invT(0,0), end = invT(1,0) in node-local normalized coords
  const sx = ic, sy = iF;
  const ex = ia + ic, ey = id + iF;
  const dx = ex - sx, dy = ey - sy;
  let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
  angle = ((angle % 360) + 360) % 360;
  return Math.round(angle);
}

// Radial center + radii as percentages of node bounds, derived from gradientTransform.
function radialGradientParams(gt) {
  if (!gt || gt.length < 2) return { cx: 50, cy: 50, rx: 50, ry: 50 };
  const a = gt[0][0], b = gt[0][1], c = gt[0][2];
  const d = gt[1][0], e = gt[1][1], f = gt[1][2];
  const det = a * e - b * d;
  if (!isFinite(det) || Math.abs(det) < 1e-10) return { cx: 50, cy: 50, rx: 50, ry: 50 };
  const ia = e / det, ib = -b / det;
  const id = -d / det, ie = a / det;
  const ic = -(ia * c + ib * f);
  const iF = -(id * c + ie * f);
  // center = invT(0.5, 0.5); x-radius endpoint = invT(1, 0.5); y-radius endpoint = invT(0.5, 1)
  const cx = 0.5 * ia + 0.5 * ib + ic;
  const cy = 0.5 * id + 0.5 * ie + iF;
  const ex = 1 * ia + 0.5 * ib + ic;
  const ey = 1 * id + 0.5 * ie + iF;
  const ex2 = 0.5 * ia + 1 * ib + ic;
  const ey2 = 0.5 * id + 1 * ie + iF;
  const rx = Math.hypot(ex - cx, ey - cy);
  const ry = Math.hypot(ex2 - cx, ey2 - cy);
  return {
    cx: Math.round(cx * 100),
    cy: Math.round(cy * 100),
    rx: Math.round(rx * 100),
    ry: Math.round(ry * 100),
  };
}

function paintsToBackground(paints) {
  if (!paints || paints === figma.mixed || paints.length === 0) return null;
  const visible = paints.filter((x) => x.visible !== false);
  if (visible.length === 0) return null;

  // Layer multiple paints as a comma-separated background list
  const layers = [];
  let imagePaint = null;
  for (const p of visible) {
    const paintOpacity = p.opacity == null ? 1 : p.opacity;
    if (p.type === "SOLID") {
      const col = rgbToCss(p.color, paintOpacity);
      layers.push(`linear-gradient(${col}, ${col})`);
    } else if (p.type === "GRADIENT_LINEAR" && p.gradientStops) {
      const angle = linearGradientAngle(p.gradientTransform);
      // Paint-level opacity multiplies each stop's alpha
      const stops = p.gradientStops
        .map((s) => {
          const a = (s.color.a == null ? 1 : s.color.a) * paintOpacity;
          return `${rgbToCss(s.color, a)} ${Math.round(s.position * 100)}%`;
        })
        .join(", ");
      layers.push(`linear-gradient(${angle}deg, ${stops})`);
    } else if (p.type === "GRADIENT_RADIAL" && p.gradientStops) {
      const { cx, cy, rx, ry } = radialGradientParams(p.gradientTransform);
      const stops = p.gradientStops
        .map((s) => {
          const a = (s.color.a == null ? 1 : s.color.a) * paintOpacity;
          return `${rgbToCss(s.color, a)} ${Math.round(s.position * 100)}%`;
        })
        .join(", ");
      layers.push(`radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, ${stops})`);
    } else if (p.type === "IMAGE") {
      imagePaint = p;
    }
  }

  const result = {};
  if (layers.length > 0) result.background = layers.length === 1 ? layers[0] : layers.reverse().join(", ");
  if (imagePaint) result.__imagePaint = imagePaint;
  return Object.keys(result).length ? result : null;
}

function strokePaintsToColor(paints) {
  if (!paints || paints === figma.mixed || paints.length === 0) return null;
  const p = paints.find((x) => x.visible !== false);
  if (!p || p.type !== "SOLID") return null;
  return rgbToCss(p.color, p.opacity == null ? 1 : p.opacity);
}

function effectsToShadow(effects) {
  if (!effects || effects.length === 0) return null;
  const shadows = [];
  for (const e of effects) {
    if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      const inset = e.type === "INNER_SHADOW" ? "inset " : "";
      const color = rgbToCss(e.color, e.color.a);
      shadows.push(
        `${inset}${Math.round(e.offset.x)}px ${Math.round(e.offset.y)}px ${Math.round(
          e.radius
        )}px ${Math.round(e.spread || 0)}px ${color}`
      );
    }
  }
  if (shadows.length === 0) return null;
  return shadows.join(", ");
}

// Layer-blur and background-blur → CSS filter / backdrop-filter.
// Background blur is the "glass" effect — the dock's translucent look.
function effectsToFilters(effects) {
  if (!effects || effects.length === 0) return {};
  const s = {};
  for (const e of effects) {
    if (e.visible === false) continue;
    if (e.type === "LAYER_BLUR") {
      s.filter = `blur(${Math.round(e.radius)}px)`;
    } else if (e.type === "BACKGROUND_BLUR") {
      const v = `blur(${Math.round(e.radius)}px)`;
      s.backdropFilter = v;
      s.WebkitBackdropFilter = v;
    }
  }
  return s;
}

function radiusStyle(node) {
  const s = {};
  if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
    s.borderRadius = Math.round(node.cornerRadius);
    return s;
  }
  if (node.cornerRadius === figma.mixed) {
    if (node.topLeftRadius) s.borderTopLeftRadius = Math.round(node.topLeftRadius);
    if (node.topRightRadius) s.borderTopRightRadius = Math.round(node.topRightRadius);
    if (node.bottomLeftRadius) s.borderBottomLeftRadius = Math.round(node.bottomLeftRadius);
    if (node.bottomRightRadius) s.borderBottomRightRadius = Math.round(node.bottomRightRadius);
  }
  return s;
}

function fontWeightFromStyle(styleName) {
  if (!styleName) return 400;
  const s = styleName.toLowerCase();
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("regular") || s.includes("normal")) return 400;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("demibold")) return 600;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  if (s.includes("bold")) return 700;
  return 400;
}

function textAlignFromH(h) {
  if (h === "LEFT") return "left";
  if (h === "CENTER") return "center";
  if (h === "RIGHT") return "right";
  if (h === "JUSTIFIED") return "justify";
  return undefined;
}

// ---------- layout ----------

function layoutStyle(node, isRoot, isAbsolute) {
  const s = {};
  const r = (v) => Math.round(v);

  // Dimensions
  if (typeof node.width === "number") s.width = r(node.width);
  if (typeof node.height === "number") s.height = r(node.height);

  // Auto layout -> flex
  if (node.layoutMode && node.layoutMode !== "NONE") {
    s.display = "flex";
    s.flexDirection = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    if (typeof node.itemSpacing === "number" && node.itemSpacing > 0) s.gap = r(node.itemSpacing);
    if (typeof node.paddingTop === "number" && node.paddingTop > 0) s.paddingTop = r(node.paddingTop);
    if (typeof node.paddingRight === "number" && node.paddingRight > 0) s.paddingRight = r(node.paddingRight);
    if (typeof node.paddingBottom === "number" && node.paddingBottom > 0) s.paddingBottom = r(node.paddingBottom);
    if (typeof node.paddingLeft === "number" && node.paddingLeft > 0) s.paddingLeft = r(node.paddingLeft);

    const axisMap = {
      MIN: "flex-start",
      CENTER: "center",
      MAX: "flex-end",
      SPACE_BETWEEN: "space-between",
    };
    if (node.primaryAxisAlignItems) s.justifyContent = axisMap[node.primaryAxisAlignItems];
    if (node.counterAxisAlignItems) s.alignItems = axisMap[node.counterAxisAlignItems];

    if (node.primaryAxisSizingMode === "AUTO") {
      if (node.layoutMode === "HORIZONTAL") delete s.width;
      else delete s.height;
    }
    if (node.counterAxisSizingMode === "AUTO") {
      if (node.layoutMode === "HORIZONTAL") delete s.height;
      else delete s.width;
    }
  }

  // Non-root, non-autolayout children positioned absolutely by parent
  if (!isRoot && isAbsolute) {
    s.position = "absolute";
    s.left = r(node.x);
    s.top = r(node.y);
  }

  return s;
}

// Layout-only style for elements whose visual content is fully self-contained
// (inline SVG, rasterized img). Avoids leaking node fills/strokes/effects
// behind the SVG's transparent regions — with two exceptions that are safe
// to keep on the wrapper:
//   1) border-radius + overflow:hidden: belt-and-braces clip for cases where
//      Figma's SVG export drops an internal mask (e.g. yellow/plain icons
//      rendering as sharp squares even though the Figma node is rounded).
//   2) drop-shadow effects: box-shadow paints outside the element's box and
//      would be clipped if left inside the SVG's viewBox.
function svgWrapperStyle(node, isRoot, isAbsolute) {
  const s = Object.assign({}, layoutStyle(node, isRoot, isAbsolute));
  if (typeof node.opacity === "number" && node.opacity < 1) s.opacity = node.opacity;
  s.display = s.display || "block";
  s.flexShrink = 0;

  // Clip to the node's corner radius even if the inline SVG's mask fails.
  const r = radiusStyle(node);
  if (Object.keys(r).length > 0) {
    Object.assign(s, r);
    s.overflow = "hidden";
  }

  // Outer drop shadows only (inner shadows are in the SVG already).
  if (node.effects && node.effects.length) {
    const outer = node.effects
      .filter((e) => e.visible !== false && e.type === "DROP_SHADOW")
      .map(
        (e) =>
          `${Math.round(e.offset.x)}px ${Math.round(e.offset.y)}px ${Math.round(
            e.radius
          )}px ${Math.round(e.spread || 0)}px ${rgbToCss(e.color, e.color.a)}`
      );
    if (outer.length) s.boxShadow = outer.join(", ");
  }

  return s;
}

function nodeStyle(node, isRoot, isAbsolute) {
  let s = Object.assign({}, layoutStyle(node, isRoot, isAbsolute));

  // Background — skip for TEXT (fills become text color) and vector-like nodes
  // (fills are already baked into the rasterized PNG we emit)
  if (node.type !== "TEXT" && !isVectorLike(node)) {
    const bg = paintsToBackground(node.fills);
    if (bg && !bg.__imagePaint) Object.assign(s, bg);
  }

  // Border — honor stroke alignment (INSIDE/OUTSIDE/CENTER) via box-shadow,
  // which unlike border doesn't affect the box model or get clipped by parents.
  if (node.strokes && node.strokes.length > 0 && node.strokeWeight) {
    const strokeColor = strokePaintColor(node.strokes);
    const w = typeof node.strokeWeight === "number" ? node.strokeWeight : 1;
    if (strokeColor) {
      const isDashed = Array.isArray(node.dashPattern) && node.dashPattern.length > 0;
      if (isDashed) {
        // box-shadow can't do dashed — fall back to border
        const style = node.dashPattern[0] <= w * 1.5 ? "dotted" : "dashed";
        s.border = `${Math.round(w)}px ${style} ${strokeColor}`;
      } else {
        const align = node.strokeAlign || "INSIDE";
        const shadows = [];
        const rw = Math.round(w);
        if (align === "INSIDE") {
          shadows.push(`inset 0 0 0 ${rw}px ${strokeColor}`);
        } else if (align === "OUTSIDE") {
          shadows.push(`0 0 0 ${rw}px ${strokeColor}`);
        } else {
          // CENTER — half inside, half outside
          const half = Math.max(1, Math.round(w / 2));
          shadows.push(`inset 0 0 0 ${half}px ${strokeColor}`);
          shadows.push(`0 0 0 ${half}px ${strokeColor}`);
        }
        s.__strokeShadow = shadows.join(", ");
      }
    }
  }

  // Radius
  Object.assign(s, radiusStyle(node));

  // Shadow (drop/inner) + combine with stroke-as-box-shadow if present
  const shadow = effectsToShadow(node.effects);
  const pieces = [];
  if (s.__strokeShadow) pieces.push(s.__strokeShadow);
  if (shadow) pieces.push(shadow);
  if (pieces.length) s.boxShadow = pieces.join(", ");
  delete s.__strokeShadow;

  // Blur effects (layer-blur → filter, background-blur → backdrop-filter)
  Object.assign(s, effectsToFilters(node.effects));

  // Opacity
  if (typeof node.opacity === "number" && node.opacity < 1) s.opacity = node.opacity;

  // Overflow
  if (node.clipsContent) s.overflow = "hidden";

  return s;
}

// Get a usable CSS color for a stroke. Prefers SOLID, falls back to the first
// stop of a gradient stroke (since CSS border can't take a gradient natively).
function strokePaintColor(paints) {
  if (!paints || paints === figma.mixed || paints.length === 0) return null;
  const p = paints.find((x) => x.visible !== false);
  if (!p) return null;
  const a = p.opacity == null ? 1 : p.opacity;
  if (p.type === "SOLID") return rgbToCss(p.color, a);
  if ((p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_RADIAL") && p.gradientStops && p.gradientStops.length) {
    const stop = p.gradientStops[Math.floor(p.gradientStops.length / 2)];
    const alpha = (stop.color.a == null ? 1 : stop.color.a) * a;
    return rgbToCss(stop.color, alpha);
  }
  return null;
}

function textStyle(node) {
  const s = {};
  const r2 = (v) => Math.round(v * 100) / 100;
  if (typeof node.fontSize === "number") s.fontSize = r2(node.fontSize);
  if (node.fontName && typeof node.fontName === "object") {
    s.fontFamily = node.fontName.family;
    s.fontWeight = fontWeightFromStyle(node.fontName.style);
    if ((node.fontName.style || "").toLowerCase().includes("italic")) {
      s.fontStyle = "italic";
    }
  }
  if (typeof node.letterSpacing === "object" && node.letterSpacing) {
    if (node.letterSpacing.unit === "PIXELS") s.letterSpacing = r2(node.letterSpacing.value);
    else if (node.letterSpacing.unit === "PERCENT")
      s.letterSpacing = `${r2(node.letterSpacing.value)}%`;
  }
  if (typeof node.lineHeight === "object" && node.lineHeight) {
    if (node.lineHeight.unit === "PIXELS") s.lineHeight = `${r2(node.lineHeight.value)}px`;
    else if (node.lineHeight.unit === "PERCENT")
      s.lineHeight = r2(node.lineHeight.value / 100);
  }
  const align = textAlignFromH(node.textAlignHorizontal);
  if (align) s.textAlign = align;

  const color = strokePaintsToColor(node.fills) || (() => {
    if (!node.fills || node.fills.length === 0) return null;
    const p = node.fills[0];
    if (p.type === "SOLID") return rgbToCss(p.color, p.opacity == null ? 1 : p.opacity);
    return null;
  })();
  if (color) s.color = color;

  if (node.textDecoration === "UNDERLINE") s.textDecoration = "underline";
  if (node.textDecoration === "STRIKETHROUGH") s.textDecoration = "line-through";

  return s;
}

// ---------- style serialization ----------

function styleObjectToJsx(s) {
  const entries = Object.keys(s).filter((k) => !k.startsWith("__"));
  if (entries.length === 0) return "";
  const parts = entries.map((k) => {
    const v = s[k];
    if (typeof v === "number") return `${k}: ${v}`;
    return `${k}: ${JSON.stringify(v)}`;
  });
  return `{{ ${parts.join(", ")} }}`;
}

function escapeText(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\u007b")
    .replace(/\}/g, "\\u007d")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- image export ----------

function bytesToBase64(bytes) {
  if (figma.base64Encode) return figma.base64Encode(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function detectImageMime(bytes) {
  // Sniff magic bytes. Default to PNG.
  if (!bytes || bytes.length < 4) return "image/png";
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  // WebP (RIFF....WEBP)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  return "image/png";
}

async function exportNodeAsPngDataUrl(node) {
  try {
    const bytes = await node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 2 },
    });
    return `data:image/png;base64,${bytesToBase64(bytes)}`;
  } catch (e) {
    return null;
  }
}

// Export the node as inline SVG markup. Preserves vector fidelity for icons,
// gradients, strokes, effects — raster fills get embedded as data-URL images
// inside the SVG automatically by Figma's exporter.
async function exportNodeAsSvgString(node) {
  try {
    const bytes = await node.exportAsync({ format: "SVG" });
    // SVG export returns UTF-8 bytes
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes);
    }
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  } catch (e) {
    return null;
  }
}

// Monotonically increasing so every inlined SVG gets a unique id-namespace,
// avoiding collisions when multiple SVGs define e.g. id="mask0_1".
let __svgInstanceCounter = 0;

// Rewrite every id/url(#…)/href="#…" in the SVG to use a unique prefix.
// Without this, browsers collapse same-IDs across inlined SVGs and masks/
// clipPaths on later instances silently fail — yellow icon renders as a
// sharp square instead of a rounded-rect.
function namespaceSvgIds(svg) {
  if (!svg) return svg;
  const prefix = `fe${(++__svgInstanceCounter).toString(36)}_`;
  // Collect every id on the SVG first, so references can be rewritten safely.
  const ids = new Set();
  svg.replace(/\bid="([^"]+)"/g, (_, id) => {
    ids.add(id);
    return "";
  });
  if (ids.size === 0) return svg;
  // id="X"   → id="prefix_X"
  svg = svg.replace(/\bid="([^"]+)"/g, (_m, id) =>
    ids.has(id) ? `id="${prefix}${id}"` : _m
  );
  // url(#X)  → url(#prefix_X)
  svg = svg.replace(/url\(#([^)]+)\)/g, (_m, id) =>
    ids.has(id) ? `url(#${prefix}${id})` : _m
  );
  // href="#X" / xlink:href="#X"
  svg = svg.replace(/(\b(?:xlink:)?href)="#([^"]+)"/g, (_m, attr, id) =>
    ids.has(id) ? `${attr}="#${prefix}${id}"` : _m
  );
  return svg;
}

// Strip the outer <svg> tag's width/height so CSS sizing on the wrapping div
// controls the rendered size (keeps scalability), and namespace every id so
// inlining many SVGs on the same page doesn't collide on mask/clipPath refs.
function normalizeSvgForInline(svg, width, height) {
  if (!svg) return svg;
  // Ensure a viewBox so the SVG scales properly when resized via CSS.
  if (!/viewBox=/i.test(svg) && width && height) {
    svg = svg.replace(
      /<svg\b([^>]*)>/i,
      (m, attrs) => `<svg${attrs} viewBox="0 0 ${width} ${height}">`
    );
  }
  // Remove explicit width/height so parent CSS governs size.
  svg = svg.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    const cleaned = attrs
      .replace(/\s(width|height)="[^"]*"/gi, "")
      .replace(/\s(width|height)='[^']*'/gi, "");
    return `<svg${cleaned} width="100%" height="100%">`;
  });
  svg = namespaceSvgIds(svg);
  return svg;
}

// Get just the raw image bytes from an IMAGE paint (not a rasterization of
// the whole node) and return a data URL + CSS sizing hints.
async function imagePaintToDataUrl(paint) {
  try {
    if (!paint || !paint.imageHash) return null;
    const image = figma.getImageByHash(paint.imageHash);
    if (!image) return null;
    const bytes = await image.getBytesAsync();
    const mime = detectImageMime(bytes);
    const b64 = bytesToBase64(bytes);
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    return null;
  }
}

function imagePaintSizing(paint) {
  const s = {};
  const mode = paint && paint.scaleMode;
  if (mode === "FIT") {
    s.backgroundSize = "contain";
    s.backgroundPosition = "center";
    s.backgroundRepeat = "no-repeat";
  } else if (mode === "TILE") {
    s.backgroundRepeat = "repeat";
    if (typeof paint.scalingFactor === "number") {
      // scalingFactor is a multiplier relative to node; emit as px where possible
      s.backgroundSize = "auto";
    }
  } else if (mode === "CROP") {
    s.backgroundSize = "cover";
    s.backgroundPosition = "center";
    s.backgroundRepeat = "no-repeat";
  } else {
    // "FILL" (default in Figma)
    s.backgroundSize = "cover";
    s.backgroundPosition = "center";
    s.backgroundRepeat = "no-repeat";
  }
  return s;
}

// ---------- tree walk ----------

function hasImageFill(node) {
  if (!node.fills || node.fills === figma.mixed) return false;
  return node.fills.some((p) => p.visible !== false && p.type === "IMAGE");
}

function isVectorLike(node) {
  return (
    node.type === "VECTOR" ||
    node.type === "BOOLEAN_OPERATION" ||
    node.type === "STAR" ||
    node.type === "POLYGON" ||
    node.type === "LINE" ||
    node.type === "ELLIPSE"
  );
}

function hasMaskChild(node) {
  if (!("children" in node)) return false;
  return node.children.some((c) => c.isMask === true);
}

async function buildNode(node, isRoot, isAbsolute) {
  if (node.visible === false) return null;

  // Text
  if (node.type === "TEXT") {
    const s = Object.assign({}, nodeStyle(node, isRoot, isAbsolute), textStyle(node));
    if (node.textAutoResize === "WIDTH_AND_HEIGHT") {
      delete s.width;
      delete s.height;
    } else if (node.textAutoResize === "HEIGHT") {
      delete s.height;
    }
    return { tag: "span", style: s, text: node.characters || "" };
  }

  // Vector / icon — inline as SVG (scalable, exact gradients/strokes/effects)
  if (isVectorLike(node)) {
    const raw = await exportNodeAsSvgString(node);
    // SVG carries all visual info; wrapper only needs layout (width, pos).
    const s = svgWrapperStyle(node, isRoot, isAbsolute);
    if (raw) {
      const svg = normalizeSvgForInline(raw, Math.round(node.width), Math.round(node.height));
      return { tag: "svg", style: s, svg };
    }
    const dataUrl = await exportNodeAsPngDataUrl(node);
    if (dataUrl) return { tag: "img", style: s, src: dataUrl, alt: "" };
    return { tag: "div", style: s };
  }

  // Nested COMPONENT / INSTANCE / composite groups that contain masks —
  // "smart" mode rasterizes as inline SVG so masks, blends, gradient
  // transforms, and mixed paints are preserved exactly as Figma renders.
  // "structured" mode walks everything as <div>/<span>. "flatten" is handled
  // at the root in generateComponent.
  if (PARSE_MODE === "smart") {
    const isComposite =
      !isRoot &&
      (node.type === "INSTANCE" ||
        node.type === "COMPONENT" ||
        (node.type === "GROUP" && hasMaskChild(node)));
    if (isComposite) {
      const raw = await exportNodeAsSvgString(node);
      // Use layout-only style — otherwise the wrapper's background/fills leak
      // behind transparent areas of the SVG (e.g. the blueprint-grid icon).
      const s = svgWrapperStyle(node, isRoot, isAbsolute);
      if (raw) {
        const svg = normalizeSvgForInline(raw, Math.round(node.width), Math.round(node.height));
        return { tag: "svg", style: s, svg };
      }
      const dataUrl = await exportNodeAsPngDataUrl(node);
      if (dataUrl) return { tag: "img", style: s, src: dataUrl, alt: node.name || "" };
      // fall through to structured rendering
    }
  }

  // Image fill, leaf — use the raw image bytes (not a node rasterization) so
  // we never double-render a fill when combined with children/effects.
  if (hasImageFill(node) && (!("children" in node) || node.children.length === 0)) {
    const paint = node.fills.find((p) => p.visible !== false && p.type === "IMAGE");
    let dataUrl = await imagePaintToDataUrl(paint);
    if (!dataUrl) dataUrl = await exportNodeAsPngDataUrl(node); // fallback
    const s = nodeStyle(node, isRoot, isAbsolute);
    if (dataUrl) return { tag: "img", style: s, src: dataUrl, alt: node.name || "" };
    return { tag: "div", style: s };
  }

  // Container
  const s = nodeStyle(node, isRoot, isAbsolute);
  const autolayout = node.layoutMode && node.layoutMode !== "NONE";
  if (!autolayout && "children" in node && node.children.length > 0) {
    s.position = s.position || "relative";
  }

  const bg = paintsToBackground(node.fills);
  if (bg && bg.__imagePaint) {
    // Prefer the raw image over a rasterization of the whole node so children
    // aren't rendered twice (once baked into the background, once as real DOM).
    let dataUrl = await imagePaintToDataUrl(bg.__imagePaint);
    if (!dataUrl) dataUrl = await exportNodeAsPngDataUrl(node);
    if (dataUrl) {
      s.backgroundImage = `url(${dataUrl})`;
      Object.assign(s, imagePaintSizing(bg.__imagePaint));
    }
  }

  const children = [];
  if ("children" in node) {
    for (const c of node.children) {
      // Each child can override positioning via layoutPositioning:"ABSOLUTE"
      // even inside an auto-layout parent.
      const childIsAbsolute = !autolayout || c.layoutPositioning === "ABSOLUTE";
      try {
        const built = await buildNode(c, false, childIsAbsolute);
        if (built) children.push(built);
      } catch (err) {
        // Don't let one bad child drop its siblings — emit a visible placeholder.
        const w = typeof c.width === "number" ? Math.round(c.width) : 0;
        const h = typeof c.height === "number" ? Math.round(c.height) : 0;
        const x = typeof c.x === "number" ? Math.round(c.x) : 0;
        const y = typeof c.y === "number" ? Math.round(c.y) : 0;
        const ph = { tag: "div", style: { width: w, height: h } };
        if (childIsAbsolute) {
          ph.style.position = "absolute";
          ph.style.left = x;
          ph.style.top = y;
        }
        children.push(ph);
        if (typeof figma !== "undefined" && figma.ui && figma.ui.postMessage) {
          figma.ui.postMessage({
            type: "warn",
            message: `Skipped ${c.type} "${c.name}": ${String(err && err.message ? err.message : err)}`,
          });
        }
      }
    }
  }
  return { tag: "div", style: s, children };
}

// ---------- serializers ----------

function serializeJsx(n, depth) {
  const indent = "  ".repeat(depth + 2);
  const styleStr = styleObjectToJsx(n.style);
  if (n.tag === "span") {
    return `${indent}<span style=${styleStr}>${escapeText(n.text)}</span>`;
  }
  if (n.tag === "img") {
    return `${indent}<img src=${JSON.stringify(n.src)} alt=${JSON.stringify(n.alt || "")} style=${styleStr} />`;
  }
  if (n.tag === "svg") {
    // Use <div> so width/height on the style apply (inline <span> would
    // collapse the wrapper). dangerouslySetInnerHTML keeps the SVG DOM intact.
    return `${indent}<div style=${styleStr} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(
      n.svg || ""
    )} }} />`;
  }
  if (!n.children || n.children.length === 0) {
    return `${indent}<div style=${styleStr} />`;
  }
  const inner = n.children.map((c) => serializeJsx(c, depth + 1)).join("\n");
  return `${indent}<div style=${styleStr}>\n${inner}\n${indent}</div>`;
}

function camelToKebab(k) {
  return k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}
function styleObjectToCss(s) {
  const parts = [];
  for (const k of Object.keys(s)) {
    if (k.startsWith("__")) continue;
    let v = s[k];
    if (typeof v === "number") {
      // properties that should stay unitless
      const unitless = {
        opacity: 1, zIndex: 1, fontWeight: 1, lineHeight: 1, flexGrow: 1, flexShrink: 1, order: 1,
      };
      v = unitless[k] ? String(v) : v + "px";
    }
    parts.push(`${camelToKebab(k)}: ${v}`);
  }
  return parts.join("; ");
}
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function serializeHtml(n) {
  const styleStr = styleObjectToCss(n.style);
  const styleAttr = styleStr ? ` style="${escapeHtml(styleStr)}"` : "";
  if (n.tag === "span") return `<span${styleAttr}>${escapeHtml(n.text)}</span>`;
  if (n.tag === "img") return `<img src="${escapeHtml(n.src)}" alt="${escapeHtml(n.alt || "")}"${styleAttr} />`;
  if (n.tag === "svg") return `<div${styleAttr}>${n.svg || ""}</div>`;
  if (!n.children || n.children.length === 0) return `<div${styleAttr}></div>`;
  const inner = n.children.map(serializeHtml).join("");
  return `<div${styleAttr}>${inner}</div>`;
}

async function generateComponent(root) {
  let tree;
  if (PARSE_MODE === "flatten") {
    // One big SVG for the entire selection — highest fidelity, zero parsing.
    const raw = await exportNodeAsSvgString(root);
    const s = {
      width: Math.round(root.width || 0),
      height: Math.round(root.height || 0),
    };
    if (raw) {
      const svg = normalizeSvgForInline(raw, s.width, s.height);
      tree = { tag: "svg", style: s, svg };
    } else {
      const dataUrl = await exportNodeAsPngDataUrl(root);
      tree = dataUrl
        ? { tag: "img", style: s, src: dataUrl, alt: root.name || "" }
        : { tag: "div", style: s };
    }
  } else {
    tree = await buildNode(root, true, false);
  }
  const jsx = tree ? serializeJsx(tree, 0) : "    <div />";
  const html = tree ? serializeHtml(tree) : "";
  const name = sanitizeName(root.name);
  const lines = [
    `// Generated from Figma by "Figma to React Exporter"`,
    `// Source node: ${root.name}`,
    ``,
    `export default function ${name}() {`,
    `  return (`,
    jsx,
    `  );`,
    `}`,
    ``,
  ];
  // Collapse any accidental multi-blank runs (some environments double LFs in string transport).
  const file = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  const abs = root.absoluteBoundingBox || null;
  return {
    name,
    file,
    html,
    width: Math.round(root.width || 0),
    height: Math.round(root.height || 0),
    // Canvas position so the UI can lay multiple components out like Figma.
    canvasX: abs ? Math.round(abs.x) : 0,
    canvasY: abs ? Math.round(abs.y) : 0,
  };
}

// ---------- message handling ----------

// Parse-mode is read from the UI message and made available to buildNode via
// a module-level flag (simpler than threading through every recursive call).
let PARSE_MODE = "flatten";

figma.ui.onmessage = async (msg) => {
  if (msg.type === "export") {
    try {
      PARSE_MODE = msg.mode || "smart";

      let targets = figma.currentPage.selection.slice();
      if (targets.length === 0) {
        // export the current page's top-level frames
        targets = figma.currentPage.children.filter(
          (n) => n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE"
        );
      }
      if (targets.length === 0) {
        figma.ui.postMessage({ type: "error", message: "No frame selected and page has no frames." });
        return;
      }

      const components = [];
      for (const t of targets) {
        figma.ui.postMessage({ type: "progress", message: `Exporting ${t.name}...` });
        const c = await generateComponent(t);
        components.push(c);
      }

      figma.ui.postMessage({ type: "result", components });
    } catch (e) {
      figma.ui.postMessage({ type: "error", message: String(e && e.message ? e.message : e) });
    }
  }

  if (msg.type === "close") figma.closePlugin();
};
