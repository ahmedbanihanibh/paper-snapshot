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
      `}</style>
      <Overlay />
      <Show when={store.isActive()}>
        <Toolbar />
      </Show>
      <ModePrompt />
      <Preview />
      <RecordingIndicator />
    </>
  );
}
