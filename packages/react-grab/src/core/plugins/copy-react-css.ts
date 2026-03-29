import { copyContent } from "../../utils/copy-content.js";
import { createPendingSelectionPlugin } from "./create-pending-selection-plugin.js";

// ── Helpers ──────────────────────────────────────────────────────────

const SVG_ATTRIBUTES = new Set([
  "viewBox",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "transform",
  "xmlns",
  "clip-rule",
  "fill-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "href",
  "xlink:href",
  "text-anchor",
  "dominant-baseline",
  "preserveAspectRatio",
]);

const SVG_ELEMENT_NAMES = new Set([
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "g",
  "defs",
  "clipPath",
  "use",
  "symbol",
  "text",
  "tspan",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "feGaussianBlur",
  "feOffset",
  "feMerge",
  "feMergeNode",
  "feColorMatrix",
  "feBlend",
  "feComposite",
  "feFlood",
  "foreignObject",
  "image",
  "pattern",
  "marker",
  "title",
  "desc",
]);

/**
 * Properties that add noise without meaningful visual impact for AI consumers.
 * We strip these to keep output concise.
 */
const REDUNDANT_PROPS = new Set([
  "border-block-start-color",
  "border-block-start-style",
  "border-block-start-width",
  "border-block-end-color",
  "border-block-end-style",
  "border-block-end-width",
  "border-inline-start-color",
  "border-inline-start-style",
  "border-inline-start-width",
  "border-inline-end-color",
  "border-inline-end-style",
  "border-inline-end-width",
  "padding-block-start",
  "padding-block-end",
  "padding-inline-start",
  "padding-inline-end",
  "margin-block-start",
  "margin-block-end",
  "margin-inline-start",
  "margin-inline-end",
  "inset-block-start",
  "inset-block-end",
  "inset-inline-start",
  "inset-inline-end",
  "caret-color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke-width",
  "-webkit-tap-highlight-color",
  "outline-offset",
  "text-decoration-color",
  "column-rule-color",
  "text-size-adjust",
  "-webkit-text-size-adjust",
  "animation-duration",
  "animation-timing-function",
  "animation-delay",
  "animation-iteration-count",
  "animation-direction",
  "animation-fill-mode",
  "animation-play-state",
  "animation-name",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "transition-property",
]);

// Create a hidden reference element to compare default styles against.
let referenceElement: HTMLElement | null = null;
let referenceStyles: CSSStyleDeclaration | null = null;

const ensureReference = (): CSSStyleDeclaration => {
  if (referenceStyles) return referenceStyles;
  referenceElement = document.createElement("div");
  referenceElement.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:0;height:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(referenceElement);
  referenceStyles = getComputedStyle(referenceElement);
  return referenceStyles;
};

const disposeReference = (): void => {
  referenceElement?.remove();
  referenceElement = null;
  referenceStyles = null;
};

/**
 * Convert "border-top-width" -> "borderTopWidth"
 */
const toCamelCase = (prop: string): string =>
  prop.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

/**
 * Convert rgb(r, g, b) / rgba(r, g, b, a) to #hex.  Leaves other values untouched.
 */
const rgbToHex = (value: string): string =>
  value.replace(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/g,
    (_, r, g, b, a) => {
      const hex =
        "#" +
        [r, g, b]
          .map((c: string) => Number(c).toString(16).padStart(2, "0"))
          .join("");
      if (a !== undefined && Number(a) < 1) {
        const alphaHex = Math.round(Number(a) * 255)
          .toString(16)
          .padStart(2, "0");
        return hex + alphaHex;
      }
      return hex;
    },
  );

/**
 * Determine whether an element is effectively invisible.
 */
const isInvisible = (computed: CSSStyleDeclaration): boolean => {
  if (computed.display === "none") return true;
  if (
    computed.opacity === "0" &&
    (computed.position === "absolute" || computed.position === "fixed")
  ) {
    return true;
  }
  return false;
};

const isSvgElement = (el: Element): boolean =>
  SVG_ELEMENT_NAMES.has(el.tagName.toLowerCase()) ||
  el instanceof SVGElement;

/**
 * Build a JSX style object string from computed styles, e.g.
 * `{ display: "flex", color: "#ff0000" }`
 */
const buildStyleObject = (element: Element): string | null => {
  const computed = getComputedStyle(element);
  const defaults = ensureReference();
  const entries: string[] = [];

  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    if (REDUNDANT_PROPS.has(prop)) continue;
    if (prop.startsWith("-webkit-") && !prop.startsWith("-webkit-backdrop"))
      continue;
    if (prop.startsWith("-moz-") || prop.startsWith("-ms-")) continue;

    const value = computed.getPropertyValue(prop);
    if (!value || value === "initial" || value === "none") continue;

    // Skip if identical to default reference
    const defaultVal = defaults.getPropertyValue(prop);
    if (value === defaultVal) continue;

    // Skip border color/style when border-width is 0
    if (
      (prop.endsWith("-color") || prop.endsWith("-style")) &&
      prop.startsWith("border-")
    ) {
      const side = prop.replace(/border-/, "").replace(/-(color|style)$/, "");
      if (side) {
        const w = computed.getPropertyValue(`border-${side}-width`);
        if (w === "0px" || w === "0") continue;
      }
    }

    const camel = toCamelCase(prop);
    const converted = rgbToHex(value);
    entries.push(`${camel}: "${converted}"`);
  }

  if (entries.length === 0) return null;
  return `{ ${entries.join(", ")} }`;
};

/**
 * Collect SVG-specific attributes that should be preserved in JSX output.
 */
const getSvgAttributes = (element: Element): string => {
  const attrs: string[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (SVG_ATTRIBUTES.has(attr.name)) {
      // Convert attribute names to JSX camelCase where needed
      const jsxName =
        attr.name === "clip-rule"
          ? "clipRule"
          : attr.name === "fill-rule"
            ? "fillRule"
            : attr.name === "stroke-width"
              ? "strokeWidth"
              : attr.name === "stroke-linecap"
                ? "strokeLinecap"
                : attr.name === "stroke-linejoin"
                  ? "strokeLinejoin"
                  : attr.name === "stroke-dasharray"
                    ? "strokeDasharray"
                    : attr.name === "stroke-dashoffset"
                      ? "strokeDashoffset"
                      : attr.name === "stroke-opacity"
                        ? "strokeOpacity"
                        : attr.name === "fill-opacity"
                          ? "fillOpacity"
                          : attr.name === "text-anchor"
                            ? "textAnchor"
                            : attr.name === "dominant-baseline"
                              ? "dominantBaseline"
                              : attr.name === "xlink:href"
                                ? "xlinkHref"
                                : attr.name;
      attrs.push(`${jsxName}="${attr.value}"`);
    }
  }
  return attrs.length ? " " + attrs.join(" ") : "";
};

// ── Serialiser ───────────────────────────────────────────────────────

const indent = (text: string, level: number): string => {
  const pad = "  ".repeat(level);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
};

const serializeNode = (node: Node, depth: number): string => {
  // Text nodes
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (!text) return "";
    // Escape JSX-sensitive characters
    return text.replace(/[{}<>]/g, (ch) =>
      ch === "{" ? "&#123;" : ch === "}" ? "&#125;" : ch === "<" ? "&lt;" : "&gt;",
    );
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const computed = getComputedStyle(el);

  // Skip invisible elements
  if (isInvisible(computed)) return "";

  // Skip <script>, <style>, <noscript>, <link>, <meta>
  if (["script", "style", "noscript", "link", "meta"].includes(tag)) return "";

  const isSvg = isSvgElement(el);

  // Build attributes string
  let attrsStr = "";

  if (isSvg) {
    attrsStr += getSvgAttributes(el);
  }

  // Style object (skip for SVG leaf elements like <path>, <circle> etc. that have no visual style)
  const svgLeaves = new Set(["path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "stop"]);
  if (!svgLeaves.has(tag)) {
    const styleObj = buildStyleObject(el);
    if (styleObj) {
      attrsStr += ` style={${styleObj}}`;
    }
  }

  // Handle <img> src and alt
  if (tag === "img") {
    const src = el.getAttribute("src");
    const alt = el.getAttribute("alt");
    if (src) attrsStr += ` src="${src}"`;
    if (alt) attrsStr += ` alt="${alt}"`;
  }

  // Handle <a> href
  if (tag === "a") {
    const href = el.getAttribute("href");
    if (href) attrsStr += ` href="${href}"`;
  }

  // Handle <input> type, placeholder, value
  if (tag === "input") {
    const type = el.getAttribute("type");
    const placeholder = el.getAttribute("placeholder");
    if (type) attrsStr += ` type="${type}"`;
    if (placeholder) attrsStr += ` placeholder="${placeholder}"`;
  }

  // Handle <button> type
  if (tag === "button") {
    const type = el.getAttribute("type");
    if (type) attrsStr += ` type="${type}"`;
  }

  // Serialize children
  const childResults: string[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const childStr = serializeNode(el.childNodes[i], depth + 1);
    if (childStr) childResults.push(childStr);
  }

  // Self-closing tags
  const voidTags = new Set(["img", "input", "br", "hr", "area", "base", "col", "embed", "source", "track", "wbr"]);
  if (voidTags.has(tag) || (isSvg && childResults.length === 0 && svgLeaves.has(tag))) {
    return `<${tag}${attrsStr} />`;
  }

  if (childResults.length === 0) {
    return `<${tag}${attrsStr} />`;
  }

  // If children are only text (single child, no newline), keep inline
  if (childResults.length === 1 && !childResults[0].includes("\n") && !childResults[0].includes("<")) {
    return `<${tag}${attrsStr}>${childResults[0]}</${tag}>`;
  }

  const childrenStr = childResults.map((c) => indent(c, 1)).join("\n");
  return `<${tag}${attrsStr}>\n${childrenStr}\n</${tag}>`;
};

/**
 * Serialize one or more DOM elements into a React JSX component string
 * with fully-resolved inline styles.
 */
const serializeToReactJsx = (elements: Element[]): string => {
  ensureReference();

  const bodyParts = elements.map((el) => serializeNode(el, 0));
  const body = bodyParts.filter(Boolean).join("\n");

  const wrapped =
    elements.length > 1
      ? `<>\n${indent(body, 1)}\n</>`
      : body;

  return [
    "export default function CapturedComponent() {",
    "  return (",
    indent(wrapped, 2),
    "  );",
    "}",
  ].join("\n");
};

// ── Plugin ───────────────────────────────────────────────────────────

export const copyReactCssPlugin = createPendingSelectionPlugin({
  name: "copy-react-css",
  contextMenuAction: (api) => ({
    id: "copy-react-css",
    label: "Copy as React JSX",
    showInToolbarMenu: true,
    onAction: async (context) => {
      await context.performWithFeedback(async () => {
        const jsx = serializeToReactJsx(context.elements);
        if (!jsx) return false;

        const stackContext = await api.getStackContext(context.element);
        const content = stackContext ? `${jsx}\n${stackContext}` : jsx;

        return copyContent(content, {
          componentName: context.componentName,
          tagName: context.tagName,
        });
      });
    },
  }),
  cleanup: disposeReference,
});
