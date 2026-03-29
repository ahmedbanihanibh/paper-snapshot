import { createRoot, createEffect, onCleanup } from "solid-js";
import { store, actions } from "./store";
import { ELEMENT_DETECTION_THROTTLE_MS, Z_BLANKET, Z_UI } from "../constants";
import type { UIToCodeAPI, UIToCodeOptions, Plugin } from "../types";

// ============================================================================
// Core Event Loop — SolidJS-powered element selection & capture
// ============================================================================

const plugins: Plugin[] = [];
let abortController: AbortController | null = null;
let shadowHost: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;

function getElementAtPosition(x: number, y: number): Element | null {
  // Temporarily hide our UI to find page elements
  if (shadowHost) shadowHost.style.pointerEvents = "none";

  const elements = document.elementsFromPoint(x, y);
  const el = elements.find((e) => {
    if (!(e instanceof HTMLElement)) return false;
    if (e === shadowHost) return false;
    if (e === document.body || e === document.documentElement) return false;
    // Skip our own injected elements
    if (e.id?.startsWith("ui2code-")) return false;
    return true;
  }) as Element | null;

  if (shadowHost) shadowHost.style.pointerEvents = "";
  return el;
}

function setupEventListeners(ac: AbortController) {
  const signal = ac.signal;
  let lastDetectionTime = 0;

  // Pointer move — throttled element detection
  document.addEventListener("pointermove", (e) => {
    actions.setPointer({ x: e.clientX, y: e.clientY });

    if (!store.isSelecting()) return;

    const now = Date.now();
    if (now - lastDetectionTime < ELEMENT_DETECTION_THROTTLE_MS) return;
    lastDetectionTime = now;

    const el = getElementAtPosition(e.clientX, e.clientY);
    actions.updateDetectedElement(el);
    plugins.forEach((p) => p.onElementHover?.(el!));
  }, { signal, passive: true });

  // Click — select element
  document.addEventListener("pointerdown", (e) => {
    if (!store.isSelecting()) return;
    e.preventDefault();
    e.stopPropagation();

    const el = store.detectedElement();
    if (el) {
      actions.selectElement(el);
      plugins.forEach((p) => p.onElementSelect?.(el));
    }
  }, { signal, capture: true });

  // Escape — cancel
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      actions.deactivate();
    }
  }, { signal, capture: true });
}

export function init(options: UIToCodeOptions = {}): UIToCodeAPI {
  let dispose: (() => void) | null = null;

  const api: UIToCodeAPI = {
    activate() {
      if (store.isActive()) return;

      abortController = new AbortController();
      setupEventListeners(abortController);
      actions.activate();

      // Create shadow host for UI rendering
      if (!shadowHost) {
        shadowHost = document.createElement("div");
        shadowHost.id = "ui2code-root";
        shadowHost.style.position = "fixed";
        shadowHost.style.inset = "0";
        shadowHost.style.zIndex = String(Z_UI);
        shadowHost.style.pointerEvents = "none";
        shadowRoot = shadowHost.attachShadow({ mode: "open" });
        document.body.appendChild(shadowHost);
      }

      // Mount SolidJS UI inside shadow root
      dispose = createRoot((disposeFn) => {
        // Reactive effects go here
        createEffect(() => {
          if (!store.isActive() && dispose) {
            disposeFn();
            dispose = null;
          }
        });

        return disposeFn;
      });

      plugins.forEach((p) => p.onActivate?.());
    },

    deactivate() {
      actions.deactivate();
      abortController?.abort();
      abortController = null;
      if (shadowHost) {
        shadowHost.remove();
        shadowHost = null;
        shadowRoot = null;
      }
      dispose?.();
      dispose = null;
      plugins.forEach((p) => p.onDeactivate?.());
    },

    toggle() {
      if (store.isActive()) {
        api.deactivate();
      } else {
        api.activate();
      }
    },

    isActive() {
      return store.isActive();
    },

    registerPlugin(plugin: Plugin) {
      plugins.push(plugin);
    },
  };

  return api;
}
