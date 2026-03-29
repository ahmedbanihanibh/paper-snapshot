import { Show } from "solid-js";
import { store, actions } from "../core/store";
import { Z_UI } from "../constants";

/**
 * Mode prompt — asks user to choose between static capture and interaction recording.
 * Shown after element selection, before capture begins.
 */
export function ModePrompt() {
  return (
    <Show when={store.phase() === "mode-prompt"}>
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
        <div
          style={{
            background: "#1c1c1e",
            "border-radius": "16px",
            "box-shadow": "0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
            padding: "32px",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            gap: "24px",
            "min-width": "360px",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.9)",
              "font-size": "16px",
              "font-weight": "600",
              "letter-spacing": "-0.01em",
            }}
          >
            How would you like to capture?
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            {/* Record Interactions button */}
            <button
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                "border-radius": "12px",
                color: "#fff",
                cursor: "pointer",
                "font-size": "14px",
                "font-weight": "500",
                padding: "16px 24px",
                "font-family": "inherit",
                display: "flex",
                "align-items": "center",
                gap: "10px",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
              onClick={() => actions.startCapture("record")}
            >
              {/* Red dot icon */}
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  "border-radius": "50%",
                  background: "#ef4444",
                  "flex-shrink": "0",
                }}
              />
              Record Interactions
            </button>

            {/* Static Capture button */}
            <button
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                "border-radius": "12px",
                color: "#fff",
                cursor: "pointer",
                "font-size": "14px",
                "font-weight": "500",
                padding: "16px 24px",
                "font-family": "inherit",
                display: "flex",
                "align-items": "center",
                gap: "10px",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
              onClick={() => actions.startCapture("static")}
            >
              {/* Camera icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ "flex-shrink": "0" }}>
                <path
                  d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"
                  fill="rgba(255,255,255,0.8)"
                />
                <path
                  d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
                  fill="rgba(255,255,255,0.8)"
                />
              </svg>
              Static Capture
            </button>
          </div>

          <div
            style={{
              color: "rgba(255,255,255,0.35)",
              "font-size": "12px",
            }}
          >
            Esc to cancel
          </div>
        </div>
      </div>
    </Show>
  );
}
