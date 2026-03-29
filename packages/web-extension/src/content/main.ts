// Main world content script — initializes UI-to-Code core library
import { init } from "ui-to-code-core/core";
import type { UIToCodeAPI } from "ui-to-code-core";

let api: UIToCodeAPI | null = null;

function initialize() {
  if (api) return;

  api = init({ enabled: false });

  // Expose on window for debugging
  (window as any).__UI_TO_CODE__ = api;
}

// Listen for toggle messages from bridge
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "__UI2CODE_TOGGLE__") {
    if (!api) initialize();
    if (event.data.enabled) {
      api!.activate();
    } else {
      api!.deactivate();
    }
  }

  if (event.data?.type === "__UI2CODE_STATE_RESPONSE__") {
    if (!api && event.data.enabled) {
      initialize();
      api!.activate();
    }
  }

  if (event.data?.type === "__UI2CODE_BRIDGE_READY__") {
    // Query initial state
    window.postMessage({ type: "__UI2CODE_QUERY_STATE__" }, "*");
  }
});

// Auto-init after a short delay (let page load)
setTimeout(() => {
  if (!api) {
    initialize();
    // Query state from bridge
    window.postMessage({ type: "__UI2CODE_QUERY_STATE__" }, "*");
  }
}, 500);
