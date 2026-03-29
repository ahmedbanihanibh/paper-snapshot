// Service worker — manages global extension state
const STORAGE_KEY = "ui2code_enabled";

// Toggle on action click
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) return;

  // Toggle state
  const { [STORAGE_KEY]: currentState } = await chrome.storage.local.get(STORAGE_KEY);
  const newState = !currentState;
  await chrome.storage.local.set({ [STORAGE_KEY]: newState });

  // Update badge
  updateBadge(newState);

  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id) {
      chrome.tabs.sendMessage(t.id, { type: "__UI2CODE_TOGGLE__", enabled: newState }).catch(() => {});
    }
  }
});

function updateBadge(enabled: boolean) {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#6366f1" : "#666" });
}

// Set initial state on install
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: false });
  updateBadge(false);
});

// Update badge on tab switch
chrome.tabs.onActivated.addListener(async () => {
  const { [STORAGE_KEY]: enabled } = await chrome.storage.local.get(STORAGE_KEY);
  updateBadge(!!enabled);
});
