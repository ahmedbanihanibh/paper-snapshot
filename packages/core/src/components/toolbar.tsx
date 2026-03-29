import { createSignal, Show, createEffect, onMount } from "solid-js";
import { store, actions } from "../core/store";
import { Z_UI } from "../constants";

/**
 * Polished floating toolbar — pill-shaped, draggable, with toggle + status.
 * Inspired by react-grab's toolbar design.
 */
export function Toolbar() {
  const [pos, setPos] = createSignal({ x: -1, y: -1 });
  const [isDragging, setIsDragging] = createSignal(false);
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [visible, setVisible] = createSignal(false);

  // Center on mount
  onMount(() => {
    setPos({ x: Math.round(window.innerWidth / 2 - 100), y: window.innerHeight - 80 });
    setTimeout(() => setVisible(true), 50);
  });

  // Auto-expand when active
  createEffect(() => {
    if (store.isSelecting() || store.isRecording() || store.phase() === "capturing" || store.phase() === "processing") {
      setIsExpanded(true);
    }
  });

  let dragOffset = { x: 0, y: 0 };

  function onPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    setIsDragging(true);
    dragOffset = { x: e.clientX - pos().x, y: e.clientY - pos().y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging()) return;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 220, e.clientX - dragOffset.x)),
      y: Math.max(8, Math.min(window.innerHeight - 60, e.clientY - dragOffset.y)),
    });
  }

  function onPointerUp() {
    setIsDragging(false);
  }

  const pillStyle = () => ({
    position: "fixed" as const,
    left: `${pos().x}px`,
    top: `${pos().y}px`,
    "z-index": String(Z_UI),
    display: "flex",
    "align-items": "center",
    gap: "2px",
    background: "rgba(23, 23, 23, 0.95)",
    "border-radius": "999px",
    padding: "4px",
    "box-shadow": "0 2px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
    "backdrop-filter": "blur(16px) saturate(1.5)",
    "font-family": "'Inter', -apple-system, system-ui, sans-serif",
    "font-size": "12px",
    color: "#e4e4e7",
    "user-select": "none",
    "pointer-events": "auto",
    cursor: isDragging() ? "grabbing" : "default",
    transform: visible() ? "translateY(0) scale(1)" : "translateY(12px) scale(0.95)",
    opacity: visible() ? "1" : "0",
    transition: isDragging() ? "none" : "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease, box-shadow 200ms ease",
    "will-change": "transform",
  });

  const btnBase = {
    background: "none",
    border: "none",
    "border-radius": "999px",
    color: "#a1a1aa",
    cursor: "pointer",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "32px",
    height: "32px",
    padding: "0",
    transition: "all 150ms ease",
    "flex-shrink": "0",
  };

  const btnActiveStyle = {
    ...btnBase,
    background: "#6366f1",
    color: "#fff",
    "box-shadow": "0 0 12px rgba(99,102,241,0.4)",
  };

  return (
    <div
      style={pillStyle()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Toggle / Select button */}
      <button
        style={store.isSelecting() ? btnActiveStyle : btnBase}
        onClick={() => {
          if (store.isSelecting()) {
            actions.deactivate();
          } else if (store.phase() === "idle" || store.phase() === "mode-prompt") {
            actions.activate();
          }
        }}
        onMouseEnter={(e) => { if (!store.isSelecting()) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
        onMouseLeave={(e) => { if (!store.isSelecting()) e.currentTarget.style.background = "none"; }}
        title="Select element"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M4 4L10.5 20.5L13.5 13.5L20.5 10.5L4 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </button>

      {/* Divider */}
      <Show when={isExpanded()}>
        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.08)", "flex-shrink": "0" }} />
      </Show>

      {/* Status text / Recording indicator */}
      <Show when={isExpanded()}>
        <div style={{ display: "flex", "align-items": "center", gap: "6px", padding: "0 8px", "min-width": "0" }}>
          <Show when={store.isSelecting()}>
            <span style={{ color: "#a1a1aa", "font-size": "12px", "white-space": "nowrap" }}>Select element</span>
          </Show>

          <Show when={store.isRecording()}>
            <div style={{
              width: "6px", height: "6px", "border-radius": "50%", background: "#ef4444",
              animation: "ui2code-pulse 1s ease-in-out infinite", "flex-shrink": "0",
            }} />
            <span style={{ color: "#fca5a5", "font-size": "12px", "white-space": "nowrap" }}>
              REC {store.recordingEventCount()}
            </span>
            <button
              style={{ ...btnBase, width: "auto", padding: "2px 10px", background: "rgba(239,68,68,0.15)", color: "#fca5a5", "font-size": "11px", "font-weight": "600" }}
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; }}
            >
              Stop
            </button>
          </Show>

          <Show when={store.phase() === "capturing" || store.phase() === "processing"}>
            <div style={{
              width: "12px", height: "12px", "border-radius": "50%",
              border: "2px solid rgba(99,102,241,0.3)", "border-top-color": "#6366f1",
              animation: "ui2code-spin 0.6s linear infinite", "flex-shrink": "0",
            }} />
            <span style={{ color: "#a1a1aa", "font-size": "12px", "white-space": "nowrap" }}>Processing...</span>
          </Show>

          <Show when={store.phase() === "idle"}>
            <span style={{ color: "#71717a", "font-size": "11px", "white-space": "nowrap" }}>UI to Code</span>
          </Show>
        </div>
      </Show>

      {/* Dark mode toggle (decorative, matches react-grab aesthetic) */}
      <Show when={!isExpanded()}>
        <div style={{
          display: "flex", "align-items": "center", background: "rgba(255,255,255,0.04)",
          "border-radius": "999px", padding: "2px", gap: "0",
        }}>
          <div style={{ ...btnBase, width: "28px", height: "28px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4" fill="currentColor"/>
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div style={{ ...btnBase, width: "28px", height: "28px", background: "rgba(255,255,255,0.06)", color: "#e4e4e7" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>
            </svg>
          </div>
        </div>
      </Show>
    </div>
  );
}
