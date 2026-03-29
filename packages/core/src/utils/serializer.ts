/**
 * Element serializer — captures a DOM element as inline-styled HTML.
 * Ported from old_plugin/background.js elementSerializer.
 *
 * Key change from old plugin: takes a direct Element reference instead of a CSS selector.
 */

import { simplifyStyles } from "./style-simplifier";
import { htmlToJsx } from "./html-to-jsx";

interface SerializeResult {
  html: string;
  processedNodes: number;
}

interface SerializeOptions {
  abortSignal?: AbortSignal;
  dryRun?: boolean;
  __isRoot?: boolean;
  __processedNodes?: number;
}

interface ResolveStylesOptions {
  isRoot?: boolean;
  pseudo?: string;
}

export interface SerializerOutput {
  status: string;
  html: string;
  rawHtml: string;
}

export async function serializeElement(element: Element): Promise<SerializerOutput> {
  const alwaysSerialize = ["display"];
  const styleNames: string[] = Array.from(window.getComputedStyle(document.body));
  styleNames.push("aspect-ratio", "text-underline-offset", "text-decoration-thickness", "transform-box");

  let totalNodesToProcess = 0;

  function isScaledToZeroAndOutOfFlow(styles: Record<string, string>): boolean {
    return (
      ["matrix(0, 0, 0, 1, 0, 0)", "matrix(0, 0, 0, 0, 0, 0)", "scaleX(0)", "scale(0)", "scaleY(0)"].includes(styles.transform || "") &&
      ["absolute", "fixed"].includes(styles.position || "")
    );
  }

  function isChildOfSVG(node: Node): boolean {
    let parent = node.parentElement;
    while (parent) {
      if (parent instanceof SVGElement) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function toInlineStyles(styles: Record<string, string>): string {
    return Object.entries(styles).map(([key, value]) => `${key}: ${value.replaceAll('"', "'")};`).join(" ");
  }

  function encodeHTML(str: string): string {
    return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function resolveParentBgColor(el: Element | null): string {
    const parent = el?.parentElement;
    if (parent) {
      const backgroundColor = window.getComputedStyle(parent).backgroundColor;
      if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" && backgroundColor !== "transparent") return backgroundColor;
      return resolveParentBgColor(parent);
    }
    return "";
  }

  function resolveComputedStyles(el: Element, { isRoot = false, pseudo }: ResolveStylesOptions = {}): Record<string, string> {
    const styles: Record<string, string> = {};
    const computedStylesValues = new Map<string, string>();

    if (pseudo) {
      const computedStyles = window.getComputedStyle(el, pseudo);
      for (const key of styleNames) {
        computedStylesValues.set(key, computedStyles.getPropertyValue(key));
      }
    } else {
      const computedStyles = (el as HTMLElement).computedStyleMap();
      for (const key of styleNames) {
        const value = computedStyles.get(key);
        if (value) computedStylesValues.set(key, value.toString());
      }
    }

    const referenceStyleValues = new Map<string, string>();
    const referenceElement = document.createElement("link");
    referenceElement.textContent = el.textContent;
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

    if (el.parentElement?.lastElementChild === el) {
      el.insertAdjacentElement("afterend", referenceElement);
    } else {
      el.insertAdjacentElement("beforebegin", referenceElement);
    }

    if (pseudo) {
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
      const box = el.getBoundingClientRect();
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
      isRoot && el instanceof Element &&
      (!computedStylesValues.get("background-color") || computedStylesValues.get("background-color") === "rgba(0, 0, 0, 0)");

    if (rootBackgroundInvisible) {
      styles["background-color"] = resolveParentBgColor(el);
    }

    if (styles["scrollbar-gutter"]?.includes("stable") && el instanceof HTMLElement) {
      const borderLeft = parseFloat(computedStylesValues.get("border-left-width") || "0");
      const borderRight = parseFloat(computedStylesValues.get("border-right-width") || "0");
      const scrollbarWidth = el.offsetWidth - el.clientWidth - borderLeft - borderRight;
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

  function collapseWhiteSpace(node: Text): string {
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

  async function serialize(
    target: Node,
    { abortSignal, dryRun = false, __isRoot = true, __processedNodes = 0 }: SerializeOptions = {}
  ): Promise<SerializeResult> {
    if (abortSignal?.aborted) return { html: "", processedNodes: 0 };

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
    const children: string[] = [];
    let styles: Record<string, string> = {};

    if (!dryRun) {
      const beforeStyles = resolveComputedStyles(target, { pseudo: "::before" });
      if (Object.keys(beforeStyles).length && !isScaledToZeroAndOutOfFlow(beforeStyles)) {
        children.push(`<div style="${toInlineStyles(beforeStyles)}"></div>`);
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

    const targetAttributes: [string, string][] = target.getAttributeNames().map((name) => [name, target.getAttribute(name) || ""]);

    for (let i = 0; i < target.childNodes.length; i++) {
      const child = target.childNodes[i];
      const childrenToTraverse: Node[] = [];

      if (child instanceof SVGElement && child.tagName === "use") {
        const href = child.getAttribute("href") || child.getAttribute("xlink:href");
        const referencedElement = document.getElementById(href?.replace("#", "") || "");
        if (referencedElement) {
          if (["symbol", "svg"].includes(referencedElement.tagName)) {
            for (const name of referencedElement.getAttributeNames()) {
              if (["id", "class", "style"].includes(name)) continue;
              if (!target.hasAttribute(name)) {
                targetAttributes.push([name, referencedElement.getAttribute(name) || ""]);
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
          if (!dryRun) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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

      if ((target as HTMLInputElement).type === "text" && (target as HTMLInputElement).value !== "") {
        const valueStyles: Record<string, string> = { height: "fit-content" };
        children.push(`<div style="${toInlineStyles(valueStyles)}">${(target as HTMLInputElement).value}</div>`);
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
      children.push(`<div style="${toInlineStyles(afterStyles)}"></div>`);
    }

    const attributesToSerialize: [string, string][] = [];

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
        let resolvedValue = value;
        if (["fill", "stroke", "color"].includes(name)) {
          if (resolvedValue.startsWith("var(")) {
            const computedValue = styles[name];
            if (computedValue) resolvedValue = computedValue;
          } else if (resolvedValue.toLowerCase() === "currentcolor") {
            const computedValue = styles[name] ?? styles.color;
            if (computedValue) resolvedValue = computedValue;
          }
        }
        attributesToSerialize.push([name, resolvedValue.replaceAll('"', "'")]);
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

    const isElementVisible = isChildOfSVG(target) || ((target as HTMLElement).checkVisibility() && styles.display !== "contents");
    if (isElementVisible) {
      const html = `<${finalTagName} ${attributesToSerialize.map(([key, value]) => `${key}="${value}"`).join(" ")}>${children.join("")}</${finalTagName}>`;
      return { html, processedNodes };
    }

    return { html: children.join(""), processedNodes };
  }

  // Scan stylesheets for :hover, :focus, :active rules that apply to captured elements.
  // Uses element.matches() for precise matching instead of class-name guessing.
  function extractInteractiveStyles(rootEl: Element): string {
    const interactivePseudos = [":hover", ":focus", ":active", ":focus-visible", ":focus-within"];
    const collectedRules: string[] = [];
    const allElements = [rootEl, ...rootEl.querySelectorAll("*")];
    const seen = new Set<string>();

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
          } catch (_e) {
            // Invalid selector — skip
            continue;
          }
          if (!matches) continue;

          seen.add(sel);
          // Keep original selector with class names
          collectedRules.push(`${sel} { ${rule.style.cssText} }`);

          // Cap at 50 rules to avoid bloating the output
          if (collectedRules.length >= 50) break;
        }
      } catch (_e) {
        // Cross-origin stylesheet — skip
      }
      if (collectedRules.length >= 50) break;
    }

    return collectedRules.length > 0 ? collectedRules.join(" ") : "";
  }

  // --- Main serialization flow ---

  const abortController = new AbortController();
  function keyDownHandler(e: KeyboardEvent): void {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); abortController.abort(); }
  }
  window.addEventListener("keydown", keyDownHandler, { capture: true });

  const dryRun = await serialize(element, { dryRun: true });
  totalNodesToProcess = dryRun.processedNodes;

  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  const result = await serialize(element, { abortSignal: abortController.signal });
  window.removeEventListener("keydown", keyDownHandler, { capture: true });

  if (abortController.signal.aborted) return { status: "aborted", html: "", rawHtml: "" };

  // Extract interactive CSS rules
  const _interactiveCSS = extractInteractiveStyles(element);

  // Strip page-only positioning from root
  let rootHtml = result.html;
  rootHtml = rootHtml.replace(/^(<\w+\s[^>]*?)style="([^"]*)"/, (_match: string, before: string, styleStr: string) => {
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
  const claudeOutput = `/**\n * UI Snapshot — Convert to React component.\n * Match the EXACT visual appearance: colors, spacing, typography, icons, layout.\n */\nexport default function CapturedComponent() {\n  return (\n${jsxCode}\n  );\n}\n`;

  return { status: "success", html: claudeOutput, rawHtml: rawHtml };
}
