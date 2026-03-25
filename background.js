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

    if (element.parentElement?.lastElementChild === element) {
      element.insertAdjacentElement("afterend", referenceElement);
    } else {
      element.insertAdjacentElement("beforebegin", referenceElement);
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
      children.push(`<div style="${toInlineStyles(afterStyles)}"></div>`);
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

    // Extract interactive CSS rules (hover, focus, active, transitions)
    const interactiveCSS = extractInteractiveStyles(elementToSerialize);

    // Strip positioning styles from the root element that only make sense
    // in the original page context (z-index, pointer-events)
    let rootHtml = result.html;
    rootHtml = rootHtml.replace(/^(<\w+\s[^>]*?)style="([^"]*)"/, (match, before, styleStr) => {
      const cleaned = styleStr
        .replace(/\bz-index:\s*[^;]+;?\s*/g, "")
        .replace(/\bpointer-events:\s*[^;]+;?\s*/g, "")
        .trim();
      return `${before}style="${cleaned}"`;
    });

    // Structure output for Claude Code readability:
    // 1. Instruction header
    // 2. Component HTML with inline styles (the main content)
    // 3. Interactive CSS rules at the end as reference
    let finalHtml = `<!-- UI SNAPSHOT: Convert this captured HTML to a React component.\n     All visual styles are inline. Original CSS classes are in data-class attributes.\n     Implement hover/focus/active states based on the interactive CSS below. -->\n`;
    finalHtml += rootHtml;
    if (interactiveCSS) {
      finalHtml += `\n<!-- INTERACTIVE STYLES (hover/focus/active) for reference: -->\n<style>${interactiveCSS}</style>`;
    }

    return { status: "success", html: finalHtml };
  }

  return { status: "error", error: "Element not found" };

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
function showPreview(html) {
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

    const copyBtn = document.createElement("button");
    Object.assign(copyBtn.style, { background: "#6366f1", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: "600", padding: "6px 20px", fontFamily: "inherit", transition: "all 150ms ease", boxShadow: "0 1px 3px rgba(99,102,241,0.3)" });
    copyBtn.textContent = "Copy to Clipboard";
    copyBtn.onmouseenter = () => { copyBtn.style.background = "#818cf8"; };
    copyBtn.onmouseleave = () => { copyBtn.style.background = "#6366f1"; };

    headerRight.append(sizeLabel, cancelBtn, copyBtn);
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

    toolbar.append(zoomLabelText, zoomOutBtn, zoomLabel, zoomInBtn, fitBtn);

    // Preview container using Shadow DOM for style isolation
    const previewScroller = document.createElement("div");
    Object.assign(previewScroller.style, { flex: "1", overflow: "auto", position: "relative", background: "#1a1a1a" });

    const previewHost = document.createElement("div");
    Object.assign(previewHost.style, { minHeight: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "24px", boxSizing: "border-box", transition: "transform 150ms ease" });
    const shadow = previewHost.attachShadow({ mode: "open" });
    // Detect page's color-scheme to match dark/light mode rendering
    const pageColorScheme = window.getComputedStyle(document.documentElement).colorScheme ||
                            window.getComputedStyle(document.body).colorScheme || "normal";
    // Inject the serialized HTML into the shadow DOM
    shadow.innerHTML = `<style>
      :host { display: contents; color-scheme: ${pageColorScheme}; }
      *, *::before, *::after { box-sizing: border-box; }
    </style>${html}`;
    previewScroller.appendChild(previewHost);

    // Scroll wheel zoom
    previewScroller.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom = Math.max(25, Math.min(300, zoom + (e.deltaY < 0 ? 10 : -10)));
        updateZoom();
      }
    }, { passive: false });

    // Footer
    const footer = document.createElement("div");
    Object.assign(footer.style, { padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", fontSize: "12px", textAlign: "center", flexShrink: "0" });
    footer.textContent = "Paste into Claude Code \u2192 ask to convert to React component  \u00b7  Ctrl+scroll to zoom";

    panel.append(header, toolbar, previewScroller, footer);
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
    copyBtn.addEventListener("click", () => close("copy"));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close("cancel"); });

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); document.removeEventListener("keydown", onKey, { capture: true }); close("cancel"); }
      if (e.key === "Enter") { e.preventDefault(); document.removeEventListener("keydown", onKey, { capture: true }); close("copy"); }
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
                args: [serializationResult.html],
              });

              const action = previewResult?.result;
              if (action === "copy") {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: copyToClipboard,
                  args: [serializationResult.html],
                });
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: showToast,
                  args: ["Copied! Paste the HTML into Claude Code to generate React components."],
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
