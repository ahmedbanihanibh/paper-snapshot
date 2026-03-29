/**
 * Clipboard utility — copies text as both text/plain and text/html.
 * Ported from old_plugin/background.js copyToClipboard.
 */

function waitForFocus(): Promise<void> {
  if (document.hasFocus()) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    window.addEventListener("focus", () => resolve(), { once: true });
  });
}

export async function copyToClipboard(text: string): Promise<void> {
  await waitForFocus();
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([text], { type: "text/plain" }),
      "text/html": new Blob([text], { type: "text/html" }),
    }),
  ]);
}
