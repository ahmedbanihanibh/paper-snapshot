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
// PAPER-COMPATIBLE SERIALIZER: authoritative source used by spec-crawler
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
