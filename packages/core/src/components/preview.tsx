import { Show, createEffect, onCleanup } from "solid-js";
import { store, actions } from "../core/store";
import { Z_UI } from "../constants";
import { copyToClipboard } from "../utils/clipboard";

/**
 * Preview panel — shows captured HTML in a shadow DOM container with tabs
 * for Visual Preview and React JSX code view. Includes zoom controls and
 * copy buttons for both raw HTML and AI-friendly JSX format.
 */
export function Preview() {
  let previewHostRef: HTMLDivElement | undefined;
  let previewScrollerRef: HTMLDivElement | undefined;

  // Mount captured HTML into shadow DOM when result changes
  createEffect(() => {
    const result = store.captureResult();
    if (result && previewHostRef) {
      // Clear any previous shadow root content
      const existing = previewHostRef.shadowRoot;
      if (existing) {
        existing.innerHTML = "";
      }
      const shadow = existing || previewHostRef.attachShadow({ mode: "open" });
      const pageColorScheme =
        window.getComputedStyle(document.documentElement).colorScheme ||
        window.getComputedStyle(document.body).colorScheme ||
        "normal";
      shadow.innerHTML = `<style>
        :host { display: contents; color-scheme: ${pageColorScheme}; }
        *, *::before, *::after { box-sizing: border-box; }
      </style>${result.rawHtml}`;
    }
  });

  // Update transform when zoom changes
  createEffect(() => {
    const z = store.zoom();
    if (previewHostRef) {
      previewHostRef.style.transform = `scale(${z / 100})`;
      previewHostRef.style.transformOrigin = "top center";
    }
  });

  // Keyboard shortcuts
  function onKeyDown(e: KeyboardEvent) {
    if (store.phase() !== "previewing") return;
    if (e.key === "Escape") {
      e.preventDefault();
      actions.deactivate();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleCopyAI();
    }
  }

  createEffect(() => {
    if (store.phase() === "previewing") {
      document.addEventListener("keydown", onKeyDown, { capture: true });
      onCleanup(() => {
        document.removeEventListener("keydown", onKeyDown, { capture: true });
      });
    }
  });

  function handleZoomOut() {
    actions.setZoom(Math.max(25, store.zoom() - 25));
  }

  function handleZoomIn() {
    actions.setZoom(Math.min(300, store.zoom() + 25));
  }

  function handleFit() {
    if (!previewScrollerRef || !previewHostRef) return;
    const scrollerRect = previewScrollerRef.getBoundingClientRect();
    const hostRect = previewHostRef.getBoundingClientRect();
    if (hostRect.width > 0 && hostRect.height > 0) {
      const currentScale = store.zoom() / 100;
      const realW = hostRect.width / currentScale;
      const realH = hostRect.height / currentScale;
      const fitW = (scrollerRect.width - 48) / realW;
      const fitH = (scrollerRect.height - 48) / realH;
      let newZoom = Math.round((Math.min(fitW, fitH, 1) * 100) / 25) * 25;
      newZoom = Math.max(25, Math.min(300, newZoom));
      actions.setZoom(newZoom);
    } else {
      actions.setZoom(100);
    }
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 10 : -10;
      actions.setZoom(Math.max(25, Math.min(300, store.zoom() + delta)));
    }
  }

  async function handleCopyRaw() {
    const result = store.captureResult();
    if (result) {
      await copyToClipboard(result.rawHtml);
    }
  }

  async function handleCopyAI() {
    const result = store.captureResult();
    if (result) {
      await copyToClipboard(result.jsxCode);
    }
  }

  function sizeKB(): string {
    const result = store.captureResult();
    if (!result) return "0 KB";
    return `${(new Blob([result.rawHtml]).size / 1024).toFixed(1)} KB`;
  }

  return (
    <Show when={store.phase() === "previewing"}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": String(Z_UI),
          background: "rgba(0,0,0,0.6)",
          "backdrop-filter": "blur(4px)",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) actions.deactivate();
        }}
      >
        {/* Panel */}
        <div
          style={{
            background: "#1c1c1e",
            "border-radius": "16px",
            "box-shadow": "0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
            display: "flex",
            "flex-direction": "column",
            "max-width": "90vw",
            "max-height": "90vh",
            "min-width": "480px",
            "min-height": "360px",
            width: "75vw",
            height: "80vh",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              padding: "16px 20px",
              "border-bottom": "1px solid rgba(255,255,255,0.08)",
              "flex-shrink": "0",
            }}
          >
            <div
              style={{
                color: "rgba(255,255,255,0.9)",
                "font-size": "14px",
                "font-weight": "600",
                "letter-spacing": "-0.01em",
              }}
            >
              Preview Captured Element
            </div>
            <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
              {/* Size label */}
              <div
                style={{
                  color: "rgba(255,255,255,0.4)",
                  "font-size": "12px",
                  "font-variant-numeric": "tabular-nums",
                  "margin-right": "8px",
                }}
              >
                {sizeKB()}
              </div>

              {/* Cancel button */}
              <button
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  "border-radius": "8px",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  "font-size": "13px",
                  "font-weight": "500",
                  padding: "6px 16px",
                  "font-family": "inherit",
                  transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                }}
                onClick={() => actions.deactivate()}
              >
                Cancel
              </button>

              {/* Copy HTML button */}
              <button
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  "border-radius": "8px",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  "font-size": "12px",
                  "font-weight": "500",
                  padding: "6px 12px",
                  "font-family": "inherit",
                  transition: "all 150ms ease",
                }}
                title="Copy raw HTML source (for HTML viewers, paper.design)"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.14)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                }}
                onClick={handleCopyRaw}
              >
                Copy HTML
              </button>

              {/* Copy for Claude/v0 button */}
              <button
                style={{
                  background: "#6366f1",
                  border: "1px solid rgba(255,255,255,0.1)",
                  "border-radius": "8px",
                  color: "#fff",
                  cursor: "pointer",
                  "font-size": "12px",
                  "font-weight": "600",
                  padding: "6px 14px",
                  "font-family": "inherit",
                  transition: "all 150ms ease",
                  "box-shadow": "0 1px 3px rgba(99,102,241,0.3)",
                }}
                title="Copy simplified + annotated HTML for AI tools"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#818cf8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#6366f1";
                }}
                onClick={handleCopyAI}
              >
                Copy for Claude/v0
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              gap: "0",
              "border-bottom": "1px solid rgba(255,255,255,0.08)",
              "flex-shrink": "0",
            }}
          >
            <button
              style={{
                background: "none",
                border: "none",
                "border-bottom": store.previewTab() === "visual"
                  ? "2px solid #6366f1"
                  : "2px solid transparent",
                color: store.previewTab() === "visual"
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(255,255,255,0.5)",
                cursor: "pointer",
                "font-size": "13px",
                "font-weight": "500",
                padding: "10px 20px",
                "font-family": "inherit",
                transition: "all 150ms ease",
              }}
              onClick={() => actions.setPreviewTab("visual")}
            >
              Visual Preview
            </button>
            <button
              style={{
                background: "none",
                border: "none",
                "border-bottom": store.previewTab() === "jsx"
                  ? "2px solid #6366f1"
                  : "2px solid transparent",
                color: store.previewTab() === "jsx"
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(255,255,255,0.5)",
                cursor: "pointer",
                "font-size": "13px",
                "font-weight": "500",
                padding: "10px 20px",
                "font-family": "inherit",
                transition: "all 150ms ease",
              }}
              onClick={() => actions.setPreviewTab("jsx")}
            >
              React JSX
            </button>
          </div>

          {/* Zoom toolbar (visual tab only) */}
          <Show when={store.previewTab() === "visual"}>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "8px",
                padding: "8px 20px",
                "border-bottom": "1px solid rgba(255,255,255,0.06)",
                "flex-shrink": "0",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.4)", "font-size": "12px" }}>
                Zoom:
              </span>
              <ZoomButton text="\u2212" title="Zoom out" onClick={handleZoomOut} />
              <span
                style={{
                  color: "rgba(255,255,255,0.5)",
                  "font-size": "12px",
                  "font-variant-numeric": "tabular-nums",
                  "min-width": "40px",
                  "text-align": "center",
                }}
              >
                {store.zoom()}%
              </span>
              <ZoomButton text="+" title="Zoom in" onClick={handleZoomIn} />
              <ZoomButton text="\u2922" title="Fit to view" onClick={handleFit} />
            </div>
          </Show>

          {/* Visual preview container */}
          <Show when={store.previewTab() === "visual"}>
            <div
              ref={previewScrollerRef}
              style={{
                flex: "1",
                overflow: "auto",
                position: "relative",
                background: "#1a1a1a",
              }}
              onWheel={handleWheel}
            >
              <div
                ref={previewHostRef}
                style={{
                  "min-height": "100%",
                  display: "flex",
                  "justify-content": "center",
                  "align-items": "flex-start",
                  padding: "24px",
                  "box-sizing": "border-box",
                  transition: "transform 150ms ease",
                }}
              />
            </div>
          </Show>

          {/* JSX code preview container */}
          <Show when={store.previewTab() === "jsx"}>
            <div
              style={{
                flex: "1",
                overflow: "auto",
                position: "relative",
                background: "#0d1117",
              }}
            >
              <pre
                style={{
                  margin: "0",
                  padding: "20px",
                  color: "#e6edf3",
                  "font-family": "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
                  "font-size": "12px",
                  "line-height": "1.6",
                  "white-space": "pre-wrap",
                  "word-break": "break-all",
                  "tab-size": "2",
                }}
              >
                {store.captureResult()?.jsxCode || "(JSX code will appear here)"}
              </pre>
            </div>
          </Show>

          {/* Footer */}
          <div
            style={{
              padding: "10px 20px",
              "border-top": "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.35)",
              "font-size": "12px",
              "text-align": "center",
              "flex-shrink": "0",
            }}
          >
            Ctrl+scroll to zoom &middot; Enter to copy for Claude/v0
          </div>
        </div>
      </div>
    </Show>
  );
}

/**
 * Small zoom control button used in the zoom toolbar.
 */
function ZoomButton(props: { text: string; title: string; onClick: () => void }) {
  return (
    <button
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.1)",
        "border-radius": "6px",
        color: "rgba(255,255,255,0.7)",
        cursor: "pointer",
        "font-size": "13px",
        "font-weight": "600",
        width: "28px",
        height: "28px",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "0",
        "font-family": "inherit",
        transition: "all 150ms ease",
      }}
      title={props.title}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.14)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.08)";
      }}
      onClick={props.onClick}
    >
      {props.text}
    </button>
  );
}
