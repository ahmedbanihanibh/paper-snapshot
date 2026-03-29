import { createSignal, createMemo, batch } from "solid-js";
import type { CapturePhase, CaptureMode, Pointer, ElementBounds, CaptureResult, RecordingData } from "../types";

// ============================================================================
// SolidJS Store — Reactive state machine for UI-to-Code
// ============================================================================

// Signals
const [phase, setPhase] = createSignal<CapturePhase>("idle");
const [mode, setMode] = createSignal<CaptureMode>("static");
const [pointer, setPointer] = createSignal<Pointer>({ x: 0, y: 0 });
const [detectedElement, setDetectedElement] = createSignal<Element | null>(null);
const [selectedElement, setSelectedElement] = createSignal<Element | null>(null);
const [selectedBounds, setSelectedBounds] = createSignal<ElementBounds | null>(null);
const [detectedBounds, setDetectedBounds] = createSignal<ElementBounds | null>(null);
const [captureResult, setCaptureResult] = createSignal<CaptureResult | null>(null);
const [recordingData, setRecordingData] = createSignal<RecordingData | null>(null);
const [recordingEventCount, setRecordingEventCount] = createSignal(0);
const [isEnabled, setIsEnabled] = createSignal(false);
const [zoom, setZoom] = createSignal(100);
const [previewTab, setPreviewTab] = createSignal<"visual" | "jsx">("visual");

// Derived state
const isActive = createMemo(() => phase() !== "idle");
const isSelecting = createMemo(() => phase() === "selecting");
const isRecording = createMemo(() => phase() === "recording");
const isPreviewing = createMemo(() => phase() === "previewing");
const hasResult = createMemo(() => captureResult() !== null);

// Actions
function activate() {
  batch(() => {
    setPhase("selecting");
    setIsEnabled(true);
    setDetectedElement(null);
    setSelectedElement(null);
    setCaptureResult(null);
    setRecordingData(null);
    setRecordingEventCount(0);
  });
}

function deactivate() {
  batch(() => {
    setPhase("idle");
    setIsEnabled(false);
    setDetectedElement(null);
    setSelectedElement(null);
    setSelectedBounds(null);
    setDetectedBounds(null);
    setCaptureResult(null);
    setRecordingData(null);
  });
}

function selectElement(el: Element) {
  const rect = el.getBoundingClientRect();
  batch(() => {
    setSelectedElement(el);
    setSelectedBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    setPhase("mode-prompt");
  });
}

function startCapture(captureMode: CaptureMode) {
  batch(() => {
    setMode(captureMode);
    setPhase(captureMode === "record" ? "recording" : "capturing");
  });
}

function finishCapture(result: CaptureResult) {
  batch(() => {
    setCaptureResult(result);
    setPhase("previewing");
    setPreviewTab("visual");
    setZoom(100);
  });
}

function updateDetectedElement(el: Element | null) {
  if (el) {
    const rect = el.getBoundingClientRect();
    batch(() => {
      setDetectedElement(el);
      setDetectedBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    });
  } else {
    batch(() => {
      setDetectedElement(null);
      setDetectedBounds(null);
    });
  }
}

function addRecordingEvent() {
  setRecordingEventCount((c) => c + 1);
}

function finishRecording(data: RecordingData) {
  batch(() => {
    setRecordingData(data);
    setPhase("processing");
  });
}

// Export store
export const store = {
  // Read-only state
  phase,
  mode,
  pointer,
  detectedElement,
  selectedElement,
  selectedBounds,
  detectedBounds,
  captureResult,
  recordingData,
  recordingEventCount,
  isEnabled,
  zoom,
  previewTab,
  // Derived
  isActive,
  isSelecting,
  isRecording,
  isPreviewing,
  hasResult,
};

export const actions = {
  activate,
  deactivate,
  selectElement,
  startCapture,
  finishCapture,
  updateDetectedElement,
  setPointer,
  setPhase,
  setMode,
  setZoom,
  setPreviewTab,
  addRecordingEvent,
  finishRecording,
  setRecordingData,
  setCaptureResult,
};
