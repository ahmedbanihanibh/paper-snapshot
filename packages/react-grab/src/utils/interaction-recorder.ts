import {
  nativeRequestAnimationFrame,
  nativeCancelAnimationFrame,
} from "./native-raf.js";

/**
 * Visually-relevant CSS properties tracked during interaction recording.
 */
const TRACKED_PROPERTIES = [
  "background-color",
  "color",
  "opacity",
  "transform",
  "box-shadow",
  "border-color",
  "border-radius",
  "width",
  "height",
  "padding",
  "margin",
  "display",
  "visibility",
  "outline",
  "scale",
  "translate",
  "filter",
] as const;

export interface InteractionSnapshot {
  trigger: string;
  target: string;
  timestamp: number;
  styleDiffs: Record<string, Record<string, { from: string; to: string }>>;
}

export interface RecordingData {
  snapshots: InteractionSnapshot[];
  transitions: Record<string, string>;
}

export interface RecordingControls {
  stop: () => RecordingData;
}

type StyleBaseline = Map<string, Map<string, string>>;

const LISTENED_EVENTS = [
  "mouseenter",
  "mouseleave",
  "mousedown",
  "mouseup",
  "focus",
  "blur",
  "focusin",
  "focusout",
  "click",
] as const;

/**
 * Build a CSS-path string for an element relative to a root element.
 * Returns a simple nth-child chain that is unique inside the subtree.
 */
const getRelativePath = (element: Element, root: Element): string => {
  if (element === root) return ":root";

  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(current);
    segments.unshift(
      `${current.tagName.toLowerCase()}:nth-child(${index + 1})`,
    );

    current = parent;
  }

  return segments.join(" > ");
};

/**
 * Capture the computed style baseline for every element in a subtree.
 */
const captureBaseline = (root: Element): StyleBaseline => {
  const baseline: StyleBaseline = new Map();
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];

  for (const el of elements) {
    const computed = getComputedStyle(el);
    const map = new Map<string, string>();

    for (const prop of TRACKED_PROPERTIES) {
      map.set(prop, computed.getPropertyValue(prop));
    }

    // Also capture the transition property for later use
    map.set("transition", computed.getPropertyValue("transition"));

    baseline.set(getRelativePath(el, root), map);
  }

  return baseline;
};

/**
 * Compute style diffs for all elements in the subtree against the baseline.
 */
const computeStyleDiffs = (
  root: Element,
  baseline: StyleBaseline,
): Record<string, Record<string, { from: string; to: string }>> => {
  const diffs: Record<
    string,
    Record<string, { from: string; to: string }>
  > = {};
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];

  for (const el of elements) {
    const path = getRelativePath(el, root);
    const baseStyles = baseline.get(path);
    if (!baseStyles) continue;

    const computed = getComputedStyle(el);
    const elDiffs: Record<string, { from: string; to: string }> = {};
    let hasDiff = false;

    for (const prop of TRACKED_PROPERTIES) {
      const current = computed.getPropertyValue(prop);
      const base = baseStyles.get(prop) ?? "";

      if (current !== base) {
        elDiffs[prop] = { from: base, to: current };
        hasDiff = true;
      }
    }

    if (hasDiff) {
      diffs[path] = elDiffs;
    }
  }

  return diffs;
};

/**
 * Start recording micro-interactions on an element subtree.
 *
 * Captures baseline styles, listens for interaction events and DOM mutations,
 * and records style diffs for each interaction frame.
 *
 * @param element  The root element to observe
 * @param onEvent  Callback fired whenever an interaction event is captured
 * @returns Controls object with a `stop()` method that disconnects listeners
 *          and returns the accumulated recording data
 */
export function startRecording(
  element: Element,
  onEvent: () => void,
): RecordingControls {
  const baseline = captureBaseline(element);
  const snapshots: InteractionSnapshot[] = [];
  const transitions: Record<string, string> = {};
  const abortController = new AbortController();
  const signal = abortController.signal;

  // Collect transition values from baseline
  for (const [path, styles] of baseline.entries()) {
    const transition = styles.get("transition");
    if (transition && transition !== "none" && transition !== "all 0s ease 0s") {
      transitions[path] = transition;
    }
  }

  // Debounce: only capture one snapshot per animation frame
  let pendingFrameId: number | null = null;
  let pendingTrigger: string | null = null;
  let pendingTarget: string | null = null;

  const flushSnapshot = () => {
    if (pendingTrigger === null || pendingTarget === null) return;

    const diffs = computeStyleDiffs(element, baseline);
    const hasAnyDiff = Object.keys(diffs).length > 0;

    if (hasAnyDiff) {
      snapshots.push({
        trigger: pendingTrigger,
        target: pendingTarget,
        timestamp: Date.now(),
        styleDiffs: diffs,
      });
      onEvent();
    }

    pendingTrigger = null;
    pendingTarget = null;
    pendingFrameId = null;
  };

  const scheduleSnapshot = (trigger: string, target: string) => {
    pendingTrigger = trigger;
    pendingTarget = target;

    if (pendingFrameId !== null) return;

    pendingFrameId = nativeRequestAnimationFrame(() => {
      // Wait one more frame to let CSS transitions start
      pendingFrameId = nativeRequestAnimationFrame(flushSnapshot);
    });
  };

  // Listen for interaction events on the element
  for (const eventType of LISTENED_EVENTS) {
    element.addEventListener(
      eventType,
      (event) => {
        const target =
          event.target instanceof Element
            ? getRelativePath(event.target, element)
            : ":root";
        scheduleSnapshot(eventType, target);
      },
      { signal, capture: true },
    );
  }

  // MutationObserver for class/style/attribute changes within the subtree
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target =
        mutation.target instanceof Element
          ? getRelativePath(mutation.target, element)
          : ":root";
      scheduleSnapshot("mutation", target);
      break; // One schedule per batch is enough due to debouncing
    }
  });

  mutationObserver.observe(element, {
    attributes: true,
    attributeFilter: ["class", "style", "data-state", "aria-expanded"],
    subtree: true,
  });

  // Watch document.body for portal elements (tooltips, dropdowns)
  const portalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          scheduleSnapshot("mutation", `portal:${node.tagName.toLowerCase()}`);
          break;
        }
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof Element) {
          scheduleSnapshot("mutation", `portal:${node.tagName.toLowerCase()}`);
          break;
        }
      }
    }
  });

  portalObserver.observe(document.body, {
    childList: true,
  });

  const stop = (): RecordingData => {
    abortController.abort();
    mutationObserver.disconnect();
    portalObserver.disconnect();

    if (pendingFrameId !== null) {
      nativeCancelAnimationFrame(pendingFrameId);
    }

    // Flush any pending snapshot synchronously
    if (pendingTrigger !== null && pendingTarget !== null) {
      const diffs = computeStyleDiffs(element, baseline);
      if (Object.keys(diffs).length > 0) {
        snapshots.push({
          trigger: pendingTrigger,
          target: pendingTarget,
          timestamp: Date.now(),
          styleDiffs: diffs,
        });
      }
    }

    return { snapshots, transitions };
  };

  return { stop };
}
