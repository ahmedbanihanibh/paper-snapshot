// Bridge script — Isolated world, relays chrome.runtime ↔ MAIN world

// Forward extension messages to MAIN world
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "__UI2CODE_TOGGLE__") {
    window.postMessage({ type: "__UI2CODE_TOGGLE__", enabled: message.enabled }, "*");
  }
});

// Forward storage changes to MAIN world
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ui2code_enabled) {
    window.postMessage({
      type: "__UI2CODE_TOGGLE__",
      enabled: changes.ui2code_enabled.newValue,
    }, "*");
  }
});

// Relay toolbar state saves from MAIN world to storage
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "__UI2CODE_SAVE_STATE__") {
    chrome.storage.local.set({ ui2code_toolbar_state: event.data.state });
  }

  if (event.data?.type === "__UI2CODE_QUERY_STATE__") {
    chrome.storage.local.get(["ui2code_enabled", "ui2code_toolbar_state"]).then((result) => {
      window.postMessage({
        type: "__UI2CODE_STATE_RESPONSE__",
        enabled: result.ui2code_enabled ?? false,
        toolbarState: result.ui2code_toolbar_state ?? null,
      }, "*");
    });
  }
});

// Signal that bridge is ready
window.postMessage({ type: "__UI2CODE_BRIDGE_READY__" }, "*");
