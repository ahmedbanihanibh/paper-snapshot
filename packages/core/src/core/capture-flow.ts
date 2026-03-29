/**
 * Capture flow orchestration — ties together serialization, style simplification,
 * HTML-to-JSX conversion, interaction recording, and React generation.
 *
 * Provides two entry points:
 *   - runStaticCapture: serialize → simplify → convert to JSX
 *   - runRecordingCapture: serialize baseline, record interactions, then generate interactive React
 */

import { simplifyStyles } from "../utils/style-simplifier";
import { htmlToJsx } from "../utils/html-to-jsx";
import { startRecording } from "../utils/interaction-recorder";
import { generateInteractiveReact } from "../utils/react-generator";
import type { CaptureResult, RecordingData } from "../types";

// ---------------------------------------------------------------------------
// Serializer stub
// ---------------------------------------------------------------------------
// The full element serializer has not yet been ported to the new architecture.
// We define the expected signature here and call it dynamically. When the
// serializer module is created at ../utils/serializer, this import can be
// updated to a direct static import.

/**
 * Dynamically resolve the serializer.  We try a direct import first; if the
 * module doesn't exist yet we fall back to a minimal inline implementation
 * that grabs outerHTML (good enough for dev / tests).
 */
async function serializeElement(element: Element): Promise<string> {
  // Try the canonical serializer path
  try {
    // Dynamic import so the build doesn't hard-fail when the file is missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("../utils/serializer");
    if (typeof mod.serializeElement === "function") {
      const result = await mod.serializeElement(element);
      // The serializer may return an object or a string depending on the port
      if (typeof result === "string") return result;
      if (result && typeof result === "object" && "html" in result) return (result as { html: string }).html;
    }
  } catch {
    // Module not found — fall through to inline fallback
  }

  // Fallback: grab the raw outerHTML (no style inlining / cleanup)
  return element.outerHTML;
}

// ---------------------------------------------------------------------------
// Wrap JSX in a component shell
// ---------------------------------------------------------------------------

function wrapInComponent(jsxBody: string): string {
  return [
    "/**",
    " * UI Snapshot — Convert to React component.",
    " * Match the EXACT visual appearance: colors, spacing, typography, icons, layout.",
    " */",
    "export default function CapturedComponent() {",
    "  return (",
    jsxBody,
    "  );",
    "}",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Static capture
// ---------------------------------------------------------------------------

/**
 * Run a one-shot static capture of an element.
 *
 * Pipeline: serialize → simplify redundant styles → convert to React JSX.
 *
 * @param element - The DOM element to capture
 * @returns CaptureResult with rawHtml (for previewing) and jsxCode (for AI tools)
 */
export async function runStaticCapture(
  element: Element,
): Promise<CaptureResult> {
  const rawHtml = await serializeElement(element);
  const simplified = simplifyStyles(rawHtml);
  const jsxBody = htmlToJsx(simplified);
  const jsxCode = wrapInComponent(jsxBody);

  return {
    rawHtml,
    jsxCode,
  };
}

// ---------------------------------------------------------------------------
// Recording capture
// ---------------------------------------------------------------------------

export interface RecordingCaptureControls {
  /**
   * Stop the recording and produce the final CaptureResult.
   *
   * This stops the interaction recorder, collects all snapshots,
   * generates the interactive React component, and returns the result.
   */
  stopAndProcess: () => Promise<CaptureResult>;
}

/**
 * Start a recording capture session.
 *
 * 1. Immediately serializes the element as the baseline HTML / JSX.
 * 2. Starts the interaction recorder.
 * 3. Returns controls — call `stopAndProcess()` when the user finishes recording.
 *
 * @param element - The DOM element to capture and record
 * @param onRecordingEvent - Called each time an interaction event is captured
 * @returns Controls with a stopAndProcess() method
 */
export function runRecordingCapture(
  element: Element,
  onRecordingEvent: () => void,
): RecordingCaptureControls {
  // Start recording immediately (while serialization may still be in progress)
  const recorder = startRecording(element, onRecordingEvent);

  // We'll serialize lazily on stop — this avoids race conditions where
  // serialization itself might trigger DOM changes that the recorder picks up.
  let baselineHtmlPromise: Promise<string> | null = null;

  // Kick off baseline serialization in the background
  baselineHtmlPromise = serializeElement(element);

  return {
    async stopAndProcess(): Promise<CaptureResult> {
      // 1. Stop the recorder and collect data
      const recordingData: RecordingData = recorder.stop();

      // 2. Await the baseline HTML (should already be resolved)
      const rawHtml = await (baselineHtmlPromise ?? serializeElement(element));

      // 3. Generate baseline JSX
      const simplified = simplifyStyles(rawHtml);
      const baselineJsx = htmlToJsx(simplified);

      // 4. Generate interactive React component
      let jsxCode: string;
      if (recordingData.snapshots.length > 0) {
        jsxCode = generateInteractiveReact(recordingData, baselineJsx);
      } else {
        // No interactions captured — fall back to static component
        jsxCode = wrapInComponent(baselineJsx);
      }

      return {
        rawHtml,
        jsxCode,
        recordingData,
      };
    },
  };
}
