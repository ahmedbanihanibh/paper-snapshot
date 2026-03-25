"use strict";

// ============================================================================
// CLIPBOARD: Copy serialized HTML as plain text for Claude Code
// ============================================================================
async function copyToClipboard(html) {
  // Wait for window focus (required for clipboard API)
  if (!document.hasFocus()) {
    await new Promise((resolve) => {
      window.addEventListener("focus", () => resolve(), { once: true });
    });
  }

  // Copy as both plain text (for pasting into Claude Code / terminal)
  // and HTML (for pasting into rich text editors)
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([html], { type: "text/plain" }),
      "text/html": new Blob([html], { type: "text/html" }),
    }),
  ]);
}

// ============================================================================
// ELEMENT PICKER: Overlay UI for selecting DOM elements
// ============================================================================
async function pickElement() {
  const mouse = { x: 0, y: 0 };
  const skipElements = [document.body, document.documentElement, "ui2code-toast"];
  const childStack = []; // for arrow down (undo)
  const parentStack = []; // for arrow up (undo)
  const childFrames = [];

  // Create overlay to intercept clicks
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483646";
  overlay.style.overflow = "hidden";
  skipElements.push(overlay);

  // Create highlight box
  const highlightContainer = document.createElement("div");
  highlightContainer.style.position = "fixed";
  highlightContainer.style.inset = "0";
  highlightContainer.style.overflow = "hidden";
  highlightContainer.style.pointerEvents = "none";
  highlightContainer.style.zIndex = "2147483645";

  const highlight = document.createElement("div");
  highlight.style.position = "absolute";
  highlight.style.border = "2px solid #6366f1";
  highlight.style.boxSizing = "border-box";
  highlight.style.top = "0";
  highlight.style.left = "0";
  highlight.style.borderRadius = "2px";
  highlightContainer.appendChild(highlight);

  let currentEl = null;
  let inputMode = "mouse"; // "mouse" or "keyboard"
  let state = "wait"; // wait, continue, move-to-child-document, clear-outline, completing, complete

  function broadcast(msg, target = "both") {
    if (state === "complete") return;
    if (target === "children" || target === "both") {
      childFrames.forEach((f) => f.postMessage(msg, "*"));
    }
    if (target === "parent" || target === "both") {
      window.parent.postMessage(msg, "*");
    }
  }

  function onMessage(msg, callback) {
    const handler = (e) => {
      if (e.data === msg && e.source !== window) callback(e);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }

  function getElementUnderMouse() {
    return document
      .elementsFromPoint(mouse.x, mouse.y)
      .filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        return !skipElements.some((skip) =>
          skip instanceof Element ? el === skip : el.tagName.toLowerCase() === skip
        );
      })
      .at(0);
  }

  function animationLoop() {
    if (state === "complete") return;
    requestAnimationFrame(animationLoop);

    if (state === "completing") {
      highlight.style.opacity = "0";
      return;
    }
    if (state === "wait") {
      highlight.style.opacity = "0";
      currentEl = null;
      return;
    }
    if (state === "move-to-child-document") {
      highlight.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      state = "continue";
      currentEl = null;
    }
    if (state === "clear-outline") {
      highlight.style.opacity = "0";
      state = "continue";
      currentEl = null;
    }

    // Keep focus on main window
    if (!document.hasFocus() || !document.activeElement || document.activeElement.tagName === "IFRAME") {
      window.focus();
    }

    const el = inputMode === "keyboard" ? currentEl : getElementUnderMouse();
    if (!el) {
      highlight.style.opacity = "0";
      return;
    }

    if (el.tagName === "IFRAME") {
      state = "move-to-child-document";
      return;
    }

    overlay.style.pointerEvents = "auto";
    const rect = el.getBoundingClientRect();
    highlight.style.opacity = "1";
    highlight.style.translate = `${rect.left}px ${rect.top}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    currentEl = el;
    broadcast("TRANSFER_HIGHLIGHTED", "children");
  }

  function onPointerMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (state === "wait") state = "continue";
  }

  window.addEventListener("pointermove", onPointerMove);
  document.body.appendChild(overlay);
  document.body.appendChild(highlightContainer);
  animationLoop();

  return new Promise((resolve) => {
    function cleanup() {
      setTimeout(() => {
        overlay.remove();
        highlight.remove();
        highlightContainer.remove();
      }, 21);
      cleanupListeners.forEach((fn) => fn());
      window.removeEventListener("pointermove", onPointerMove);
      broadcast("TRANSFER_COMPLETED");
      state = "complete";
    }

    const cleanupListeners = [
      onMessage("TRANSFER_COMPLETED", () => {
        removeEventHandlers();
        cleanup();
        resolve(null);
      }),
      onMessage("TRANSFER_HIGHLIGHTED", () => {
        state = "wait";
      }),
      onMessage("TRANSFER_REGISTER_CHILD", (e) => {
        childFrames.push(e.source);
      }),
    ];

    function removeEventHandlers() {
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMoveCapture, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    }

    function onPointerDown(e) {
      if (state !== "complete" && state !== "completing") {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function onClick(e) {
      e.stopPropagation();
      removeEventHandlers();
      state = "completing";

      if (currentEl) {
        const attr = "data-ui2code-picker";
        const timestamp = Date.now();
        currentEl.setAttribute(attr, `${timestamp}`);
        resolve(`[${attr}="${timestamp}"]`);
      } else {
        resolve(null);
      }
      cleanup();
    }

    function onPointerMoveCapture() {
      inputMode = "mouse";
      childStack.length = 0;
      parentStack.length = 0;
    }

    function onKeyDown(e) {
      function getParent(el) {
        const parent = el.parentElement;
        if (parent && parent.checkVisibility() && parent.clientWidth && parent.clientHeight && !skipElements.includes(parent)) {
          return parent;
        }
        return parent?.parentElement ? getParent(parent.parentElement) : null;
      }

      function getChild(el) {
        let child = el.firstElementChild;
        while (child) {
          if (child.checkVisibility() && child.clientWidth && child.clientHeight && !skipElements.includes(child) && child instanceof HTMLElement) {
            return child;
          }
          child = child.nextElementSibling;
        }
        const children = Array.from(el.children);
        for (const c of children) {
          if (c instanceof HTMLElement && c.checkVisibility() && c.clientWidth && c.clientHeight && !skipElements.includes(c)) {
            return c;
          }
        }
        return null;
      }

      if (currentEl && e.key.startsWith("Arrow")) {
        e.preventDefault();
        e.stopPropagation();
        inputMode = "keyboard";

        switch (e.key) {
          case "ArrowUp": {
            if (parentStack.length > 0) {
              currentEl = parentStack.pop();
            } else {
              const parent = getParent(currentEl);
              if (parent) {
                childStack.push(currentEl);
                currentEl = parent;
              }
            }
            break;
          }
          case "ArrowDown": {
            if (childStack.length > 0) {
              currentEl = childStack.pop();
            } else if (currentEl.children[0] instanceof HTMLElement) {
              const child = getChild(currentEl);
              if (child) {
                parentStack.push(currentEl);
                currentEl = child;
              }
            }
            break;
          }
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        removeEventHandlers();
        cleanup();
        resolve(null);
      }

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }
    }

    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMoveCapture, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    broadcast("TRANSFER_REGISTER_CHILD", "parent");
  });
}

// ============================================================================
// DOM SERIALIZER: Converts DOM subtree to HTML with computed inline styles
// ============================================================================
async function serializeElement(selector) {
  // Properties that always should be captured even if they match defaults
  const alwaysCapture = ["display"];

  // Get all CSS property names from computed style
  const allProps = Array.from(window.getComputedStyle(document.body));
  allProps.push("aspect-ratio", "text-underline-offset", "text-decoration-thickness", "transform-box");

  let totalNodes = 0;

  // Progress reporting via toast
  function updateProgress(current) {
    const toast = document.getElementsByTagName("ui2code-toast")[0];
    if (!toast) return;
    if (current === null) {
      const shadowRoot = toast?.shadowRoot;
      if (shadowRoot && toast) {
        const bar = shadowRoot.querySelector(".toast__progress");
        if (bar) {
          bar.classList.add("no-transition");
          toast.style.setProperty("--progress", "0");
          requestAnimationFrame(() => {
            bar.classList.remove("no-transition");
            toast?.style.removeProperty("--progress");
          });
        } else {
          toast.style.removeProperty("--progress");
        }
      }
      toast?.style.removeProperty("--suffix");
      toast?.style.removeProperty("--suffix-width");
      return;
    }
    if (!toast) return;
    const pct = Math.min(Math.ceil((current / totalNodes) * 100), 100);
    if (totalNodes > 50) {
      toast.style.setProperty("--progress", pct.toString());
      if (totalNodes > 100) {
        toast.style.setProperty("--suffix", `"${pct}%"`);
        toast.style.setProperty("--suffix-width", "48px");
      }
    } else {
      toast.style.removeProperty("--suffix-width");
    }
  }

  // Check if element is collapsed/invisible via transform
  function isCollapsedByTransform(styles) {
    return (
      ["matrix(0, 0, 0, 1, 0, 0)", "matrix(0, 0, 0, 0, 0, 0)", "scaleX(0)", "scale(0)", "scaleY(0)"].includes(
        styles.transform || ""
      ) && ["absolute", "fixed"].includes(styles.position || "")
    );
  }

  // Check if element is inside an SVG
  function isInsideSVG(el) {
    let parent = el.parentElement;
    while (parent) {
      if (parent instanceof SVGElement) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  // Serialize style object to inline CSS string
  function stylesToString(styles) {
    return Object.entries(styles)
      .map(([prop, val]) => `${prop}: ${val.replaceAll('"', "'")};`)
      .join(" ");
  }

  // Escape HTML special characters
  function escapeHtml(str) {
    return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  // Find nearest non-transparent background color from ancestors
  function findBackgroundColor(el) {
    const parent = el?.parentElement;
    if (parent) {
      const bg = window.getComputedStyle(parent).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      return findBackgroundColor(parent);
    }
    return "";
  }

  // Extract computed styles that differ from defaults (the key trick!)
  function extractStyles(el, { isRoot = false, pseudo } = {}) {
    const result = {};
    const computedMap = new Map();

    // Get computed styles for the element (or pseudo-element)
    if (pseudo) {
      const computed = window.getComputedStyle(el, pseudo);
      for (const prop of allProps) {
        computedMap.set(prop, computed.getPropertyValue(prop));
      }
    } else {
      const styleMap = el.computedStyleMap();
      for (const prop of allProps) {
        const val = styleMap.get(prop);
        if (val) computedMap.set(prop, val.toString());
      }
    }

    // Create a temporary "blank" element to get browser defaults
    const defaultMap = new Map();
    const temp = document.createElement("link");
    temp.textContent = el.textContent;
    temp.style.margin = "0";
    temp.style.fill = "black";
    temp.style.color = "black";
    temp.style.fontSize = "1px";
    temp.style.width = "auto";
    temp.style.height = "auto";
    temp.style.textAlign = "initial";
    temp.style.borderColor = "hotpink";
    temp.style.setProperty("z-index", "auto", "important");
    temp.style.setProperty("border-width", "0px", "important");

    if (isRoot) {
      temp.style.color = "hotpink";
      temp.style.lineHeight = "0.1234";
      temp.style.fontFamily = '"Papyrus"';
      temp.style.listStyleType = "initial";
    }

    // Insert temp element adjacent to the real element
    if (el.parentElement?.lastElementChild === el) {
      el.insertAdjacentElement("afterend", temp);
    } else {
      el.insertAdjacentElement("beforebegin", temp);
    }

    // Get default styles
    if (pseudo) {
      const computed = window.getComputedStyle(temp, pseudo);
      for (const prop of allProps) {
        defaultMap.set(prop, computed.getPropertyValue(prop));
      }
    } else {
      const styleMap = temp.computedStyleMap();
      for (const prop of allProps) {
        const val = styleMap.get(prop);
        if (val) defaultMap.set(prop, val.toString());
      }
    }
    temp.remove();

    // Compare: only keep properties that differ from defaults
    for (const prop of allProps) {
      const actual = computedMap.get(prop);
      const defaultVal = defaultMap.get(prop);
      if (actual && !actual.startsWith("--") && (actual !== defaultVal || alwaysCapture.includes(prop))) {
        result[prop] = actual.replaceAll('"', "'");
      }
    }

    // For root element: set explicit dimensions
    if (isRoot) {
      const rect = el.getBoundingClientRect();
      const w = Math.ceil(rect.width) + "px";
      const h = Math.ceil(rect.height) + "px";
      if (rect.width > 200 || rect.height > 200 || result.width?.includes("%") || result.height?.includes("%")) {
        result.width = w;
        result.height = h;
      }
    }

    // For root element: inherit background from parent if transparent
    if (isRoot && el instanceof Element) {
      if (!computedMap.get("background-color") || computedMap.get("background-color") === "rgba(0, 0, 0, 0)") {
        result["background-color"] = findBackgroundColor(el);
      }
    }

    // Handle scrollbar-gutter padding compensation
    if (result["scrollbar-gutter"]?.includes("stable") && el instanceof HTMLElement) {
      const borderLeft = parseFloat(computedMap.get("border-left-width") || "0");
      const borderRight = parseFloat(computedMap.get("border-right-width") || "0");
      const scrollbarWidth = el.offsetWidth - el.clientWidth - borderLeft - borderRight;
      if (scrollbarWidth > 0) {
        const bothSides = result["scrollbar-gutter"].includes("both");
        const direction = computedMap.get("direction") || "ltr";
        const paddingRight = parseFloat(result["padding-right"] || "0");
        const paddingLeft = parseFloat(result["padding-left"] || "0");
        if (direction === "rtl") {
          result["padding-left"] = paddingLeft + scrollbarWidth + "px";
          if (bothSides) result["padding-right"] = paddingRight + scrollbarWidth + "px";
        } else {
          result["padding-right"] = paddingRight + scrollbarWidth + "px";
          if (bothSides) result["padding-left"] = paddingLeft + scrollbarWidth + "px";
        }
      }
    }

    // For pseudo-elements: skip if no content
    if ((pseudo === "::after" || pseudo === "::before") && !result.content) {
      return {};
    }
    if (Object.keys(result).length === 0) return {};

    return result;
  }

  // Extract visible text from a text node, preserving meaningful whitespace
  function extractText(textNode) {
    const text = textNode.textContent;
    if (!text) return "";

    if (textNode.parentElement) {
      const ws = window.getComputedStyle(textNode.parentElement).whiteSpace;
      if (ws === "pre" || ws === "pre-wrap") return text;
      if (ws === "pre-line") return text.replace(/[^\S\n]+/g, " ");
    }

    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed) {
      const leadingLen = text.length - text.trimStart().length;
      const trailingLen = text.length - text.trimEnd().length;
      let hasLeading = false;
      let hasTrailing = false;

      if (leadingLen > 0) {
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, leadingLen);
        hasLeading = range.getBoundingClientRect().width > 0;
      }
      if (trailingLen > 0) {
        const range = document.createRange();
        range.setStart(textNode, text.length - trailingLen);
        range.setEnd(textNode, text.length);
        hasTrailing = range.getBoundingClientRect().width > 0;
      }
      return (hasLeading ? " " : "") + trimmed + (hasTrailing ? " " : "");
    }

    const range = document.createRange();
    range.selectNode(textNode);
    return range.getBoundingClientRect().width === 0 ? "" : " ";
  }

  // Main recursive serializer
  async function serialize(el, { abortSignal, dryRun = false, __isRoot = true, __processedNodes = 0 } = {}) {
    if (abortSignal?.aborted) return { html: "", processedNodes: 0 };

    if (!dryRun) updateProgress(__processedNodes + 1);

    // Text nodes
    if (!(el instanceof Element || el instanceof SVGElement)) {
      if (!dryRun && el instanceof Text) {
        const text = extractText(el);
        return { html: escapeHtml(text), processedNodes: 1 };
      }
      return { html: "", processedNodes: 1 };
    }

    const tagName = el.tagName.toLowerCase();
    const computed = window.getComputedStyle(el);
    const isAbsOrFixed = ["absolute", "fixed"].includes(computed.position);
    const parentIsBlock = !!el.parentElement && ["block", "inline-block"].includes(window.getComputedStyle(el.parentElement).display);

    // Skip invisible elements
    const isZeroDimension = (parseFloat(computed.height) === 0 || parseFloat(computed.width) === 0) && (isAbsOrFixed || parentIsBlock);
    const isDisplayNone = computed.display === "none";
    const isInvisible = computed.opacity === "0" && isAbsOrFixed;

    if (isZeroDimension || isDisplayNone || isInvisible) {
      return { html: "", processedNodes: 1 };
    }

    let processedNodes = 1;
    const children = [];
    let styles = {};

    if (!dryRun) {
      // Capture ::before pseudo-element
      const beforeStyles = extractStyles(el, { pseudo: "::before" });
      if (Object.keys(beforeStyles).length && !isCollapsedByTransform(beforeStyles)) {
        children.push(`<div style="${stylesToString(beforeStyles)}"></div>`);
      }

      styles = extractStyles(el, { isRoot: __isRoot });
    }

    // Collect attributes
    const attrs = el.getAttributeNames().map((name) => [name, el.getAttribute(name) || ""]);

    // Process child nodes
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      const nodesToProcess = [];

      // Handle SVG <use> elements
      if (child instanceof SVGElement && child.tagName === "use") {
        const href = child.getAttribute("href") || child.getAttribute("xlink:href");
        const referenced = document.getElementById(href?.replace("#", "") || "");
        if (referenced) {
          if (["symbol", "svg"].includes(referenced.tagName)) {
            for (const attrName of referenced.getAttributeNames()) {
              if (!["id", "class", "style"].includes(attrName) && !el.hasAttribute(attrName)) {
                attrs.push([attrName, referenced.getAttribute(attrName)]);
              }
            }
            nodesToProcess.push(...Array.from(referenced.childNodes));
          } else {
            nodesToProcess.push(referenced);
          }
        }
      } else if (!(el instanceof HTMLSelectElement) && child) {
        nodesToProcess.push(child);
      }

      for (const node of nodesToProcess) {
        if (!dryRun) await new Promise((r) => requestAnimationFrame(r));
        const result = await serialize(node, {
          abortSignal,
          dryRun,
          __isRoot: false,
          __processedNodes: __processedNodes + processedNodes,
        });
        processedNodes += result.processedNodes;
        if (!dryRun) children.push(result.html);
      }
    }

    if (dryRun) return { html: "", processedNodes };

    // Handle input/textarea/select elements
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const isInline = el instanceof HTMLInputElement || el instanceof HTMLSelectElement;
      const placeholder = el instanceof HTMLSelectElement ? el.firstElementChild?.textContent : el.placeholder;

      if (el.type === "text" && el.value !== "") {
        children.push(`<div style="height: fit-content;">${el.value}</div>`);
        if (isInline) styles["align-content"] = "center";
      } else if (placeholder) {
        const placeholderStyles = extractStyles(el, { pseudo: "::placeholder" });
        placeholderStyles.width = "100%";
        placeholderStyles.height = "fit-content";
        if (isInline) {
          styles["align-content"] = "center";
          placeholderStyles["align-self"] = "center";
        }
        children.push(`<div style="${stylesToString(placeholderStyles)}">${placeholder}</div>`);
      }
    }

    // Capture ::after pseudo-element
    const afterStyles = extractStyles(el, { pseudo: "::after" });
    if (Object.keys(afterStyles).length && !isCollapsedByTransform(afterStyles)) {
      children.push(`<div style="${stylesToString(afterStyles)}"></div>`);
    }

    // Handle images
    const extraAttrs = [];
    if (el instanceof HTMLImageElement) {
      extraAttrs.push(["src", el.src]);
      if (!styles.width && !styles.height) {
        const imgComputed = window.getComputedStyle(el);
        styles.width = imgComputed.width;
        styles.height = imgComputed.height;
      }
    }

    // Handle <br>
    if (el instanceof HTMLBRElement) {
      return { html: "<br>", processedNodes };
    }

    // Normalize tag names (table elements → div)
    const tableElements = ["table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col"];
    const formElements = ["input", "textarea"];
    const outputTag = [...tableElements, ...formElements].includes(tagName) ? "div" : tagName;

    // Handle SVG attributes
    if (el instanceof SVGElement) {
      attrs.forEach(([name, val]) => {
        if (["class", "style", "display", "overflow"].includes(name) || !val) return;
        if (["fill", "stroke", "color"].includes(name)) {
          if (val.startsWith("var(")) {
            const resolved = styles[name];
            if (resolved) val = resolved;
          } else if (val.toLowerCase() === "currentcolor") {
            const resolved = styles[name] ?? styles.color;
            if (resolved) val = resolved;
          }
        }
        extraAttrs.push([name, val.replaceAll('"', "'")]);
      });
      for (const [name] of extraAttrs) {
        if (!["width", "height"].includes(name)) delete styles[name];
      }
    }

    // Build final attributes
    if (Object.keys(styles).length > 0) {
      if (styles.width || styles.height) {
        styles.width ??= "auto";
        styles.height ??= "auto";
      }
      extraAttrs.push(["style", stylesToString(styles)]);
    }

    // If element is invisible in SVG context or has display:contents, unwrap children
    if (isInsideSVG(el) || (el.checkVisibility() && styles.display === "contents")) {
      // keep as-is with tag
    }

    if (!isInsideSVG(el) && el.checkVisibility() && styles.display !== "contents") {
      return {
        html: `<${outputTag} ${extraAttrs.map(([k, v]) => `${k}="${v}"`).join(" ")}>${children.join("")}</${outputTag}>`,
        processedNodes,
      };
    }

    return { html: children.join(""), processedNodes };
  }

  // Find the target element and serialize
  const target = document.querySelector(selector);
  if (!target) return { status: "error", error: "Element not found" };

  const abortController = new AbortController();

  function onEscapeKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      abortController.abort();
    }
  }
  window.addEventListener("keydown", onEscapeKey, { capture: true });

  // Dry run to count total nodes (for progress bar)
  updateProgress(null);
  totalNodes = (await serialize(target, { dryRun: true })).processedNodes;
  updateProgress(0);

  await new Promise((r) => setTimeout(r, 500));

  // Actual serialization
  const result = await serialize(target, { abortSignal: abortController.signal });
  window.removeEventListener("keydown", onEscapeKey, { capture: true });

  if (abortController.signal.aborted) return { status: "aborted" };
  return { status: "success", html: result.html };
}

// ============================================================================
// TOAST: Notification UI
// ============================================================================
function showToast(message, { iconColor = "#6366f1", dismissTimeout = 5000, hideOnHover = false, showProgressBar = false, messageClassName = "" } = {}) {
  const existing = document.querySelector("#ui2code-toast-container");
  const container = existing || document.createElement("div");
  container.id = "ui2code-toast-container";
  container.removeAttribute("data-removing");
  container.setAttribute("data-timeout", String(dismissTimeout));

  if (existing) {
    const toast = existing.querySelector("ui2code-toast");
    if (toast) {
      const shadow = toast.shadowRoot;
      if (shadow) {
        const wrapper = shadow.querySelector(".toast__message-wrapper");
        if (wrapper) {
          const items = Array.from(wrapper.querySelectorAll(".toast__message-item"));
          if (messageClassName && items.find((i) => i.classList.contains(messageClassName))) {
            const toastEl = shadow.querySelector(".toast");
            toastEl.getAnimations().forEach((a) => a.cancel());
            toastEl.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }], {
              duration: 500,
              easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            });
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
          newItem.innerHTML = message;
          wrapper.appendChild(newItem);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const allItems = wrapper.querySelectorAll(".toast__message-item");
              const last = allItems[allItems.length - 1];
              if (last) {
                const w = Math.max(last.offsetWidth, last.scrollWidth, last.getBoundingClientRect().width);
                wrapper.style.width = `${w}px`;
              }
            });
          });
        }

        const svgPath = shadow.querySelector("svg path");
        if (svgPath) svgPath.setAttribute("fill", iconColor);

        const toastEl = shadow.querySelector(".toast");
        if (toastEl) {
          hideOnHover ? toastEl.setAttribute("data-hide-on-hover", "") : toastEl.removeAttribute("data-hide-on-hover");
        }

        const progressBar = shadow.querySelector(".toast__progress");
        if (showProgressBar && !progressBar) {
          const bar = document.createElement("div");
          bar.className = "toast__progress";
          const toastEl2 = shadow.querySelector(".toast");
          if (toastEl2) toastEl2.insertBefore(bar, toastEl2.firstChild);
        } else if (!showProgressBar && progressBar) {
          const onEnd = () => { progressBar.removeEventListener("transitionend", onEnd); progressBar.remove(); };
          progressBar.addEventListener("transitionend", onEnd, { once: true });
          progressBar.style.opacity = "0";
        }
        return;
      }
    }
  }

  container.setHTMLUnsafe(`
    <ui2code-toast>
      <template shadowrootmode="open">
        <style>
          *:not(svg *, style, span) { all: initial; }
          kbd {
            align-items: center; background-color: rgb(252, 252, 249); border-radius: 3px;
            box-shadow: inset 0 -.05em .5em #00000006, inset 0 .05em #fffffff2, inset 0 .25em .5em #00000006, inset 0 -.05em #00000026, 0 0 0 .05em #0000001f, 0 .08em .17em #0003;
            box-sizing: border-box; color: oklab(0 0 0 / 0.8); display: inline-flex;
            font-family: -apple-system, 'system-ui', system-ui, sans-serif; font-size: 12px; line-height: 1;
            height: 20px; justify-content: center; margin-inline: 2px; padding: 0 4px; min-width: 20px;
          }
          [data-hide-on-hover] { opacity: 1; }
          [data-hide-on-hover]:hover { opacity: 0; }
          .toast {
            box-sizing: border-box; position: relative; display: flex; align-items: center; contain: content;
            height: 48px; background-color: rgb(255 255 255); --popup-radius: 8px;
            border-radius: var(--popup-radius);
            box-shadow: rgb(0 0 0 / 25%) 0px 4px 20px -4px, rgb(0 0 0 / 10%) 0px 0px 0px 1px;
            font-synthesis: none; pointer-events: auto;
            transition: opacity 350ms ease, scale 350ms cubic-bezier(0.34, 1.56, 0.64, 1), translate 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
            transform-origin: top center;
            @starting-style { opacity: 0; scale: 0.98; translate: 0 -24px; }
          }
          .toast.animate-out { opacity: 0; translate: 0 -16px; scale: 0.98; transition: opacity 150ms ease-in, scale 150ms ease-in, translate 150ms ease-in; }
          .toast__placement { position: fixed; left: 0; right: 0; top: 16px; display: flex; justify-content: center; pointer-events: none; user-select: none; z-index: calc(infinity); }
          .toast__message { align-items: center; box-sizing: border-box; display: flex; flex-direction: column; flex-shrink: 0; height: 100%; overflow: hidden; position: relative; padding-right: 20px; padding-left: 50px; }
          .toast__message-wrapper { height: 100%; position: relative; transition: width 500ms cubic-bezier(0, 0.9, 0.2, 1); will-change: width; }
          .toast__message-item {
            align-items: center; display: flex; gap: 4px; height: 100%; justify-content: center; left: 50%;
            position: absolute; top: 0; transform: translateX(-50%); width: fit-content;
            color: oklab(0% 0 0 / 80%); font-size: 14px; font-family: system-ui, sans-serif;
            -moz-osx-font-smoothing: grayscale; -webkit-font-smoothing: antialiased; line-height: 16px; text-wrap-mode: nowrap;
            transition: transform 250ms cubic-bezier(0.33, 1, 0.68, 1), opacity 250ms ease-out, filter 250ms ease-out;
          }
          .toast__message-item:not(:first-child) { @starting-style { opacity: 0; filter: blur(4px); transform: translate(-50%, 24px); } }
          .toast__message-item:not(:last-child) { opacity: 0; filter: blur(4px); }
          .toast__message-item span.dot { margin: 0 4px; opacity: 0.4; }
          .toast__message-item.capturing { gap: 0px; }
          .toast__message-item.capturing::after { color: oklab(0% 0 0 / 60%); content: var(--suffix, ""); font-variant-numeric: tabular-nums; width: var(--suffix-width, 0); text-align: right; }
          .toast__progress { background-color: rgb(0 0 0 / 3.5%); inset: 0; position: absolute; scale: calc(var(--progress, 0) / 100) 1; transform-origin: left; transition: scale 250ms ease-out, opacity 150ms ease-out; }
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
          <div class="toast" ${hideOnHover ? 'data-hide-on-hover' : ''}>
            ${showProgressBar ? '<div class="toast__progress"></div>' : ''}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" fill="${iconColor}"/>
            </svg>
            <div class="toast__message">
              <div class="toast__message-wrapper">
                <div class="toast__message-item${messageClassName ? ` ${messageClassName}` : ''}">
                  ${message}
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </ui2code-toast>
  `);

  if (!container.parentElement) {
    document.body.appendChild(container);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const toast = container.querySelector("ui2code-toast");
        if (toast) {
          const shadow = toast.shadowRoot;
          if (shadow) {
            const wrapper = shadow.querySelector(".toast__message-wrapper");
            const item = shadow.querySelector(".toast__message-item");
            if (wrapper && item) {
              const w = Math.max(item.offsetWidth, item.scrollWidth, item.getBoundingClientRect().width);
              wrapper.style.width = `${w}px`;
            }
          }
        }
      });
    });
  }
}

function dismissToast({ immediate = false } = {}) {
  const container = document.querySelector("#ui2code-toast-container");
  if (!(container instanceof HTMLElement)) return;
  if (container.hasAttribute("data-removing")) return;

  const timeout = immediate ? 0 : Number(container.getAttribute("data-timeout") || "0");
  const toastEl = container.querySelector("ui2code-toast")?.shadowRoot?.querySelector(".toast");
  if (!toastEl) return;

  const doRemove = () => {
    const onEnd = () => { toastEl.removeEventListener("transitionend", onEnd); container.remove(); };
    toastEl.addEventListener("transitionend", onEnd);
  };

  if (timeout === 0) {
    toastEl.classList.add("animate-out");
    doRemove();
  } else {
    const id = Date.now().toString(36);
    container.setAttribute("data-removing", id);
    window.addEventListener("mousemove", () => {
      setTimeout(() => {
        if (container.getAttribute("data-removing") === id) {
          toastEl.classList.add("animate-out");
          doRemove();
        }
      }, timeout);
    }, { once: true });
  }
}

// ============================================================================
// PROCESSING INDICATOR: Border animation around selected element
// ============================================================================
function showProcessingIndicator(selector) {
  ["ui2code-blanket", "ui2code-indicator", "ui2code-picker-outline", "ui2code-indicator-styles"].forEach((id) =>
    document.getElementById(id)?.remove()
  );

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
  styles.id = "ui2code-indicator-styles";
  styles.textContent = `
    @keyframes __ui2code-spin { to { transform: rotate(360deg); } }
    @keyframes __ui2code-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes __ui2code-fade-out { from { opacity: 1; } to { opacity: 0; } }
  `;
  document.head.appendChild(styles);

  const indicator = document.createElement("div");
  indicator.id = "ui2code-indicator";
  Object.assign(indicator.style, {
    animation: "__ui2code-fade-in 300ms ease-in forwards",
    borderRadius: borderRadius || "0px",
    boxSizing: "border-box",
    height: `${height}px`,
    left: `${left}px`,
    maskComposite: "exclude",
    overflow: "hidden",
    padding: "2px",
    pointerEvents: "none",
    position: "absolute",
    top: `${top}px`,
    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    width: `${width}px`,
    zIndex: "calc(infinity)",
  });

  const diameter = Math.ceil(Math.sqrt(width * width + height * height));
  const spinner = document.createElement("div");
  Object.assign(spinner.style, {
    animation: "__ui2code-spin 2500ms linear infinite",
    background: "conic-gradient(#6366f1 0%, rgba(99,102,241,0.3) 25%, #6366f1 50%, rgba(99,102,241,0.3) 75%, #6366f1 100%)",
    borderRadius: "50%",
    height: `${diameter}px`,
    left: "50%",
    marginLeft: `${-diameter / 2}px`,
    marginTop: `${-diameter / 2}px`,
    position: "absolute",
    top: "50%",
    width: `${diameter}px`,
    willChange: "transform",
  });
  indicator.appendChild(spinner);

  const outline = document.createElement("div");
  outline.id = "ui2code-picker-outline";
  Object.assign(outline.style, {
    animation: "__ui2code-fade-out 300ms ease-out forwards",
    border: "2px solid #6366f1",
    borderRadius: borderRadius || "0px",
    boxSizing: "border-box",
    height: `${height}px`,
    left: `${left}px`,
    pointerEvents: "none",
    position: "absolute",
    top: `${top}px`,
    width: `${width}px`,
    zIndex: "calc(infinity)",
  });

  const blanket = document.createElement("div");
  blanket.id = "ui2code-blanket";
  Object.assign(blanket.style, { position: "fixed", inset: "0", zIndex: "calc(infinity)", cursor: "wait" });

  document.body.appendChild(blanket);
  document.body.appendChild(outline);
  document.body.appendChild(indicator);
}

function hideProcessingIndicator() {
  const indicator = document.getElementById("ui2code-indicator");
  if (!indicator) return;
  indicator.style.animation = "__ui2code-fade-out 200ms ease-in forwards";
  const cleanup = () => {
    ["ui2code-blanket", "ui2code-indicator", "ui2code-picker-outline", "ui2code-indicator-styles"].forEach((id) =>
      document.getElementById(id)?.remove()
    );
  };
  indicator.addEventListener("transitionend", cleanup, { once: true });
  setTimeout(cleanup, 300);
}

// ============================================================================
// FOCUS PROMPT: Click-to-start overlay for unfocused tabs
// ============================================================================
function showFocusPrompt() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "2147483647", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.15)", backdropFilter: "saturate(1.5)",
    });
    const label = document.createElement("div");
    Object.assign(label.style, {
      background: "rgba(0,0,0,0.82)", color: "rgba(255,255,255,0.9)",
      padding: "8px 16px", borderRadius: "10px",
      font: "500 13px/1.4 -apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif",
      pointerEvents: "none", boxShadow: "0 4px 20px -4px rgba(0,0,0,0.6)", letterSpacing: "-0.01em",
    });
    label.textContent = "Click to start selecting an element";
    overlay.appendChild(label);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", () => { overlay.remove(); resolve(); }, { once: true });
  });
}

// ============================================================================
// BACKGROUND SERVICE WORKER: Orchestrates the full flow
// ============================================================================
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.action.disable(tab.id);

  // Check if page has focus, show click prompt if not
  const [focusResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.hasFocus(),
  });
  if (focusResult?.result === false) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showFocusPrompt,
    });
  }

  // Show instruction toast
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: showToast,
    args: [
      'Click or <kbd>↵</kbd> to capture <span class="dot">·</span> <span><kbd>↑</kbd><kbd>↓</kbd></span> to fine-tune <span class="dot">·</span> <kbd>esc</kbd> to cancel',
      { dismissTimeout: 0, hideOnHover: true, messageClassName: "initial" },
    ],
  });

  // Run element picker in all frames
  chrome.scripting.executeScript(
    { target: { tabId: tab.id, allFrames: true }, func: pickElement },
    async (results) => {
      const picked = results.find((r) => !!r.result);

      if (picked) {
        const frameId = picked.frameId;
        const selector = picked.result;

        // Show processing indicator
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: showProcessingIndicator,
          args: [selector],
        });

        // Show capturing toast
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: showToast,
          args: ["Capturing element...", { iconColor: "#CCCCCC", showProgressBar: true, messageClassName: "capturing" }],
        });

        // Serialize the selected element
        const [serializeResult] = await Promise.all([
          chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [frameId] },
            func: serializeElement,
            args: [selector],
          }),
          new Promise((r) => setTimeout(r, 500)),
        ]);

        const data = serializeResult[0]?.result;

        if (data.status === "success") {
          // Copy to clipboard as plain text HTML
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: copyToClipboard,
            args: [data.html],
          });

          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showToast,
            args: ["Copied! Paste the HTML into Claude Code to generate React components."],
          });
        } else if (data.status === "error") {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showToast,
            args: ["An error occurred", { iconColor: "#CCCCCC" }],
          });
        } else {
          // Aborted
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: dismissToast,
            args: [{ immediate: true }],
          });
        }

        // Hide processing indicator
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: hideProcessingIndicator,
        });
      }

      // Dismiss toast and re-enable action
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: dismissToast,
      });
      await chrome.action.enable(tab.id);
    }
  );
});
