import { Show, createSignal } from "solid-js";
import { store, actions } from "../core/store";
import { Z_UI } from "../constants";

/**
 * Floating toolbar — shows capture controls and status.
 */
export function Toolbar() {
  const [isDragging, setIsDragging] = createSignal(false);
  const [pos, setPos] = createSignal({ x: window.innerWidth / 2 - 150, y: 16 });

  function handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX - pos().x;
    const startY = e.clientY - pos().y;

    function onMove(e: PointerEvent) {
      setPos({ x: e.clientX - startX, y: e.clientY - startY });
    }
    function onUp() {
      setIsDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      style={{
        position: "fixed",
        left: `${pos().x}px`,
        top: `${pos().y}px`,
        "z-index": String(Z_UI),
        display: "flex",
        "align-items": "center",
        gap: "8px",
        background: "#1c1c1e",
        "border-radius": "12px",
        padding: "8px 16px",
        "box-shadow": "0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
        "font-family": "-apple-system, system-ui, sans-serif",
        "font-size": "13px",
        color: "#fff",
        "user-select": "none",
        "pointer-events": "auto",
        cursor: isDragging() ? "grabbing" : "grab",
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Logo */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" fill="#6366f1"/>
      </svg>

      {/* Phase indicator */}
      <Show when={store.isSelecting()}>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>
          Select an element
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)", "font-size": "11px" }}>
          Click to capture · Esc to cancel
        </span>
      </Show>

      <Show when={store.isRecording()}>
        <div style={{
          width: "8px", height: "8px", "border-radius": "50%",
          background: "#ef4444",
          animation: "ui2code-pulse 1s ease-in-out infinite",
        }} />
        <span style={{ color: "rgba(255,255,255,0.7)" }}>
          Recording... {store.recordingEventCount()} events
        </span>
        <button
          style={{
            background: "#ef4444", border: "none", "border-radius": "6px",
            color: "#fff", cursor: "pointer", "font-size": "12px",
            "font-weight": "600", padding: "4px 12px",
            "pointer-events": "auto",
          }}
          onClick={(e) => { e.stopPropagation(); /* recorder handles stop via Escape */ }}
        >
          Stop (Esc)
        </button>
      </Show>

      <Show when={store.phase() === "capturing" || store.phase() === "processing"}>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>
          Processing...
        </span>
      </Show>

      <Show when={store.phase() === "idle"}>
        <span style={{ color: "rgba(255,255,255,0.5)", "font-size": "12px" }}>
          UI to Code
        </span>
      </Show>
    </div>
  );
}
