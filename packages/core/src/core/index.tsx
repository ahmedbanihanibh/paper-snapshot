import { createEffect } from "solid-js";
import { render } from "solid-js/web";
import { store, actions } from "./store";
import { runStaticCapture, runRecordingCapture, type RecordingCaptureControls } from "./capture-flow";
import { Renderer } from "../components/renderer";
import { ELEMENT_DETECTION_THROTTLE_MS, Z_UI } from "../constants";
import type { UIToCodeAPI, UIToCodeOptions, Plugin } from "../types";

// ============================================================================
// Core Event Loop — SolidJS-powered element selection & capture
// ============================================================================

const plugins: Plugin[] = [];
let abortController: AbortController | null = null;
let shadowHost: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let disposeRenderer: (() => void) | null = null;
let activeRecording: RecordingCaptureControls | null = null;

function getElementAtPosition(x: number, y: number): Element | null {
  if (shadowHost) shadowHost.style.pointerEvents = "none";
  const elements = document.elementsFromPoint(x, y);
  const el = elements.find((e) => {
    if (!(e instanceof HTMLElement)) return false;
    if (e === shadowHost) return false;
    if (e === document.body || e === document.documentElement) return false;
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
  }, { signal, passive: true });

  // Click — select element (only during selecting phase)
  document.addEventListener("pointerdown", (e) => {
    if (!store.isSelecting()) return;
    e.preventDefault();
    e.stopPropagation();
    const el = store.detectedElement();
    if (el) {
      actions.selectElement(el);
    }
  }, { signal, capture: true });

  // Escape — cancel or stop recording
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();

      const phase = store.phase();
      if (phase === "recording" && activeRecording) {
        // Stop recording → process results
        handleStopRecording();
      } else if (phase !== "idle") {
        api.deactivate();
      }
    }
  }, { signal, capture: true });
}

// ============================================================================
// Capture Flow Handlers — bridge store actions to capture-flow module
// ============================================================================

async function handleStaticCapture() {
  const el = store.selectedElement();
  if (!el) return;

  actions.setPhase("capturing");
  try {
    const result = await runStaticCapture(el);
    actions.finishCapture(result);
  } catch (err) {
    console.error("UI to Code: capture failed", err);
    api.deactivate();
  }
}

function handleStartRecording() {
  const el = store.selectedElement();
  if (!el) return;

  actions.setPhase("recording");
  activeRecording = runRecordingCapture(el, () => {
    actions.addRecordingEvent();
  });
}

async function handleStopRecording() {
  if (!activeRecording) return;

  actions.setPhase("processing");
  try {
    const result = await activeRecording.stopAndProcess();
    activeRecording = null;
    actions.finishCapture(result);
  } catch (err) {
    console.error("UI to Code: recording processing failed", err);
    activeRecording = null;
    api.deactivate();
  }
}

// Expose handlers globally so components can call them
(globalThis as any).__ui2code_handlers = {
  handleStaticCapture,
  handleStartRecording,
  handleStopRecording,
};

// ============================================================================
// API
// ============================================================================

let api: UIToCodeAPI;

export function init(options: UIToCodeOptions = {}): UIToCodeAPI {
  api = {
    activate() {
      if (store.isActive()) return;
      abortController = new AbortController();
      setupEventListeners(abortController);
      actions.activate();

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

      if (shadowRoot) {
        disposeRenderer = render(() => {
          // Reactive effect: watch phase changes to trigger capture flows
          createEffect(() => {
            const phase = store.phase();
            const mode = store.mode();
            if (phase === "capturing" && mode === "static") {
              handleStaticCapture();
            } else if (phase === "recording" && mode === "record") {
              handleStartRecording();
            }
          });
          return <Renderer />;
        }, shadowRoot);
      }

      plugins.forEach((p) => p.onActivate?.());
    },

    deactivate() {
      activeRecording = null;
      actions.deactivate();
      abortController?.abort();
      abortController = null;
      if (shadowHost) {
        shadowHost.remove();
        shadowHost = null;
        shadowRoot = null;
      }
      disposeRenderer?.();
      disposeRenderer = null;
      plugins.forEach((p) => p.onDeactivate?.());
    },

    toggle() {
      if (store.isActive()) api.deactivate();
      else api.activate();
    },

    isActive: () => store.isActive(),

    registerPlugin(plugin: Plugin) {
      plugins.push(plugin);
    },
  };

  return api;
}
