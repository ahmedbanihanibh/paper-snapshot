import { Show } from "solid-js";
import { store } from "../core/store";
import { Overlay } from "./overlay";
import { Toolbar } from "./toolbar";
import { ModePrompt } from "./mode-prompt";
import { Preview } from "./preview";
import { RecordingIndicator } from "./recording-indicator";

/**
 * Root renderer — mounts all UI components inside the shadow DOM.
 */
export function Renderer() {
  return (
    <>
      <style>{`
        @keyframes ui2code-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes ui2code-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ui2code-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ui2code-slide-up {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        * { box-sizing: border-box; }
      `}</style>
      <Overlay />
      <Toolbar />
      <ModePrompt />
      <Preview />
      <RecordingIndicator />
    </>
  );
}
