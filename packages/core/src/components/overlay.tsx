import { createEffect, Show, onCleanup } from "solid-js";
import { store } from "../core/store";
import { Z_OVERLAY } from "../constants";

/**
 * Canvas-based overlay that highlights detected/selected elements.
 * Renders directly to a <canvas> for zero DOM pollution.
 */
export function Overlay() {
  let canvas: HTMLCanvasElement | undefined;
  let animFrame = 0;
  let currentBounds = { x: 0, y: 0, w: 0, h: 0 };
  let targetBounds = { x: 0, y: 0, w: 0, h: 0 };

  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Smooth interpolation toward target
    currentBounds.x = lerp(currentBounds.x, targetBounds.x, 0.2);
    currentBounds.y = lerp(currentBounds.y, targetBounds.y, 0.2);
    currentBounds.w = lerp(currentBounds.w, targetBounds.w, 0.2);
    currentBounds.h = lerp(currentBounds.h, targetBounds.h, 0.2);

    const { x, y, w, h } = currentBounds;
    if (w > 1 && h > 1) {
      // Fill
      ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
      ctx.fillRect(x, y, w, h);
      // Border
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      // Label
      const label = store.selectedElement()?.tagName?.toLowerCase() || store.detectedElement()?.tagName?.toLowerCase() || "";
      if (label) {
        ctx.font = "600 11px -apple-system, system-ui, sans-serif";
        const textWidth = ctx.measureText(label).width;
        const labelX = x;
        const labelY = y - 22;
        ctx.fillStyle = "#6366f1";
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, textWidth + 12, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(label, labelX + 6, labelY + 14);
      }
    }

    // Continue animation if selecting
    if (store.isSelecting()) {
      animFrame = requestAnimationFrame(draw);
    }
  }

  // React to bounds changes
  createEffect(() => {
    const bounds = store.isSelecting() ? store.detectedBounds() : store.selectedBounds();
    if (bounds) {
      targetBounds = { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
    } else {
      targetBounds = { x: 0, y: 0, w: 0, h: 0 };
    }
  });

  // Start/stop animation loop
  createEffect(() => {
    if (store.isSelecting()) {
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(draw);
    }
  });

  onCleanup(() => cancelAnimationFrame(animFrame));

  return (
    <Show when={store.isSelecting()}>
      <canvas
        ref={canvas}
        style={{
          position: "fixed",
          inset: "0",
          "z-index": String(Z_OVERLAY),
          "pointer-events": "none",
        }}
      />
    </Show>
  );
}
