import { Show } from "solid-js";
import { store } from "../core/store";
import { Z_UI } from "../constants";

/**
 * Recording indicator — shows a pulsing red dot, event counter, and stop button
 * while interaction recording is in progress.
 */
export function RecordingIndicator() {
  return (
    <Show when={store.phase() === "recording"}>
      <div
        style={{
          position: "fixed",
          top: "16px",
          left: "50%",
          transform: "translateX(-50%)",
          "z-index": String(Z_UI),
          display: "flex",
          "align-items": "center",
          gap: "10px",
          background: "#1c1c1e",
          "border-radius": "12px",
          padding: "10px 20px",
          "box-shadow": "0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
          "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          "font-size": "13px",
          color: "#fff",
          "user-select": "none",
          "pointer-events": "auto",
        }}
      >
        {/* Pulsing red dot */}
        <div
          style={{
            width: "10px",
            height: "10px",
            "border-radius": "50%",
            background: "#ef4444",
            animation: "ui2code-pulse 1s ease-in-out infinite",
            "flex-shrink": "0",
          }}
        />

        {/* Recording text + event counter */}
        <span style={{ color: "rgba(255,255,255,0.85)", "font-weight": "500" }}>
          Recording...
        </span>
        <span
          style={{
            color: "rgba(255,255,255,0.5)",
            "font-size": "12px",
            "font-variant-numeric": "tabular-nums",
          }}
        >
          {store.recordingEventCount()} events
        </span>

        {/* Stop button */}
        <button
          style={{
            background: "#ef4444",
            border: "none",
            "border-radius": "6px",
            color: "#fff",
            cursor: "pointer",
            "font-size": "12px",
            "font-weight": "600",
            padding: "5px 14px",
            "font-family": "inherit",
            "pointer-events": "auto",
            "margin-left": "4px",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#dc2626";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ef4444";
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Dispatch Escape keydown to stop the recorder
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          }}
        >
          Stop (Esc)
        </button>
      </div>
    </Show>
  );
}
