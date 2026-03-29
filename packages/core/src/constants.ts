// Element detection
export const ELEMENT_DETECTION_THROTTLE_MS = 100;
export const POSITION_CACHE_DISTANCE_PX = 30;

// Overlay animation
export const SELECTION_LERP_FACTOR = 0.15;
export const FEEDBACK_DURATION_MS = 1000;

// Toolbar
export const TOOLBAR_SNAP_MARGIN_PX = 20;

// Recording
export const RECORDING_STYLE_PROPS = [
  "background-color", "color", "opacity", "transform", "box-shadow",
  "border-color", "border-radius", "width", "height", "max-height",
  "padding", "margin", "font-size", "font-weight", "text-decoration",
  "visibility", "display", "overflow", "clip-path", "filter",
  "backdrop-filter", "outline", "scale", "translate", "rotate",
  "gap", "left", "top", "right", "bottom", "position",
] as const;

// Z-index layers
export const Z_OVERLAY = 2147483645;
export const Z_BLANKET = 2147483646;
export const Z_UI = 2147483647;
