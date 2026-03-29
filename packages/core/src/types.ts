// State machine phases
export type CapturePhase =
  | "idle"
  | "selecting"
  | "mode-prompt"
  | "capturing"
  | "recording"
  | "processing"
  | "previewing"
  | "copied";

export type CaptureMode = "static" | "record";

export interface Pointer {
  x: number;
  y: number;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InteractionSnapshot {
  trigger: string;
  target: string;
  timestamp: number;
  styleDiffs: Record<string, Record<string, { from: string; to: string }>>;
}

export interface RecordingData {
  snapshots: InteractionSnapshot[];
  transitions: Record<string, string>;
  baselineStyles: Record<string, Record<string, string>>;
}

export interface CaptureResult {
  rawHtml: string;
  jsxCode: string;
  recordingData?: RecordingData;
}

export interface Plugin {
  name: string;
  onActivate?: () => void;
  onDeactivate?: () => void;
  onElementHover?: (el: Element) => void;
  onElementSelect?: (el: Element) => void;
  onBeforeCapture?: (el: Element) => void;
  onAfterCapture?: (result: CaptureResult) => void;
  onCopy?: (content: string, format: string) => void;
}

export interface UIToCodeOptions {
  enabled?: boolean;
  theme?: "light" | "dark" | "auto";
}

export interface UIToCodeAPI {
  activate: () => void;
  deactivate: () => void;
  toggle: () => void;
  isActive: () => boolean;
  registerPlugin: (plugin: Plugin) => void;
}
