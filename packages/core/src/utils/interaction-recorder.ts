/**
 * Interaction recorder — captures hover, click, focus, and mutation events
 * on a selected element subtree, recording style diffs for each interaction.
 *
 * Returns start/stop controls so the SolidJS component can manage lifecycle.
 */

import { RECORDING_STYLE_PROPS } from "../constants";
import type { RecordingData, InteractionSnapshot } from "../types";

/** Build a CSS-selector path from root to target within the subtree */
function getPath(target: Element, root: Element): string {
  const parts: string[] = [];
  let current: Element | null = target;

  while (current && current !== root) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName.toLowerCase() === tag,
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    } else {
      parts.unshift(tag);
    }

    current = parent;
  }

  // Prefix with root tag
  parts.unshift(root.tagName.toLowerCase());
  return parts.join(" > ");
}

/** Capture computed styles for all elements in the subtree */
function captureAllStyles(
  root: Element,
  props: readonly string[],
): Record<string, Record<string, string>> {
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  const result: Record<string, Record<string, string>> = {};

  for (const el of all) {
    const path = getPath(el, root);
    const computed = window.getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const prop of props) {
      styles[prop] = computed.getPropertyValue(prop);
    }
    result[path] = styles;
  }

  return result;
}

/** Diff two style snapshots, returning only changed properties */
function diffStyles(
  before: Record<string, Record<string, string>>,
  after: Record<string, Record<string, string>>,
): Record<string, Record<string, { from: string; to: string }>> {
  const diffs: Record<string, Record<string, { from: string; to: string }>> = {};

  for (const path of Object.keys(after)) {
    const beforeStyles = before[path];
    const afterStyles = after[path];
    if (!beforeStyles || !afterStyles) continue;

    const pathDiff: Record<string, { from: string; to: string }> = {};
    for (const prop of Object.keys(afterStyles)) {
      const fromVal = beforeStyles[prop] ?? "";
      const toVal = afterStyles[prop];
      if (fromVal !== toVal) {
        pathDiff[prop] = { from: fromVal, to: toVal };
      }
    }

    if (Object.keys(pathDiff).length > 0) {
      diffs[path] = pathDiff;
    }
  }

  return diffs;
}

/** Capture a full snapshot with style diffs from baseline */
function captureSnapshot(
  root: Element,
  baseline: Record<string, Record<string, string>>,
  trigger: string,
  target: Element,
  props: readonly string[],
): InteractionSnapshot | null {
  const current = captureAllStyles(root, props);
  const styleDiffs = diffStyles(baseline, current);

  if (Object.keys(styleDiffs).length === 0) return null;

  return {
    trigger,
    target: getPath(target, root),
    timestamp: Date.now(),
    styleDiffs,
  };
}

/** Collect CSS transition values from all elements in the subtree */
function captureTransitions(
  root: Element,
): Record<string, string> {
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  const transitions: Record<string, string> = {};

  for (const el of all) {
    const path = getPath(el, root);
    const computed = window.getComputedStyle(el);
    const transition = computed.getPropertyValue("transition");
    if (transition && transition !== "all 0s ease 0s" && transition !== "none") {
      transitions[path] = transition;
    }
  }

  return transitions;
}

export interface RecordingControls {
  stop: () => RecordingData;
}

/**
 * Start recording interactions on an element subtree.
 *
 * @param element - The root element to observe
 * @param onEvent - Called whenever an interaction event is captured (for updating counters)
 * @returns Controls with a stop() method that returns the collected RecordingData
 */
export function startRecording(
  element: Element,
  onEvent: () => void,
): RecordingControls {
  const props = RECORDING_STYLE_PROPS;
  const snapshots: InteractionSnapshot[] = [];

  // Capture baseline styles for the entire subtree
  const baselineStyles = captureAllStyles(element, props);
  const transitions = captureTransitions(element);

  // Track which elements we've attached listeners to
  const managedElements = new Set<Element>();
  const cleanups: Array<() => void> = [];
  let stopped = false;

  // Debounce snapshot capture to coalesce rapid style changes
  let pendingCapture: { trigger: string; target: Element } | null = null;
  let captureTimer: ReturnType<typeof setTimeout> | null = null;
  const CAPTURE_DELAY_MS = 80;

  function scheduleCapture(trigger: string, target: Element): void {
    if (stopped) return;
    pendingCapture = { trigger, target };

    if (captureTimer !== null) {
      clearTimeout(captureTimer);
    }

    captureTimer = setTimeout(() => {
      if (pendingCapture && !stopped) {
        const snapshot = captureSnapshot(
          element,
          baselineStyles,
          pendingCapture.trigger,
          pendingCapture.target,
          props,
        );
        if (snapshot) {
          snapshots.push(snapshot);
          onEvent();
        }
      }
      pendingCapture = null;
      captureTimer = null;
    }, CAPTURE_DELAY_MS);
  }

  function attachListeners(el: Element): void {
    if (managedElements.has(el) || stopped) return;
    managedElements.add(el);

    const htmlEl = el as HTMLElement;

    // Mouse enter/leave — hover interactions
    const onMouseEnter = (): void => {
      scheduleCapture("mouseenter", el);
    };
    const onMouseLeave = (): void => {
      scheduleCapture("mouseleave", el);
    };

    // Focus/blur
    const onFocus = (): void => {
      scheduleCapture("focus", el);
    };
    const onBlur = (): void => {
      scheduleCapture("blur", el);
    };

    // Click
    const onClick = (): void => {
      scheduleCapture("click", el);
    };

    // Pointerdown/up for active state
    const onPointerDown = (): void => {
      scheduleCapture("pointerdown", el);
    };
    const onPointerUp = (): void => {
      scheduleCapture("pointerup", el);
    };

    htmlEl.addEventListener("mouseenter", onMouseEnter);
    htmlEl.addEventListener("mouseleave", onMouseLeave);
    htmlEl.addEventListener("focus", onFocus, true);
    htmlEl.addEventListener("blur", onBlur, true);
    htmlEl.addEventListener("click", onClick);
    htmlEl.addEventListener("pointerdown", onPointerDown);
    htmlEl.addEventListener("pointerup", onPointerUp);

    cleanups.push(() => {
      htmlEl.removeEventListener("mouseenter", onMouseEnter);
      htmlEl.removeEventListener("mouseleave", onMouseLeave);
      htmlEl.removeEventListener("focus", onFocus, true);
      htmlEl.removeEventListener("blur", onBlur, true);
      htmlEl.removeEventListener("click", onClick);
      htmlEl.removeEventListener("pointerdown", onPointerDown);
      htmlEl.removeEventListener("pointerup", onPointerUp);
    });
  }

  // Attach listeners to all current elements in the subtree
  const allElements = [element, ...Array.from(element.querySelectorAll("*"))];
  for (const el of allElements) {
    attachListeners(el);
  }

  // Observe DOM mutations within the subtree to attach listeners to new elements
  const subtreeObserver = new MutationObserver((mutations) => {
    if (stopped) return;
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof Element) {
          attachListeners(node);
          // Also attach to all descendants of the new node
          for (const descendant of Array.from(node.querySelectorAll("*"))) {
            attachListeners(descendant);
          }
        }
      }
    }
    // Any DOM mutation is worth capturing as a snapshot
    scheduleCapture("mutation", element);
  });

  subtreeObserver.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-state", "aria-expanded", "aria-hidden", "open"],
  });

  // Observe document.body for portals (elements appended outside the subtree
  // that are logically related, e.g., dropdown menus, modals, tooltips)
  const bodyObserver = new MutationObserver((mutations) => {
    if (stopped) return;
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof Element && !element.contains(node)) {
          // Check if this looks like a portal (fixed/absolute positioned, high z-index)
          const style = window.getComputedStyle(node);
          const isPortalLike =
            style.position === "fixed" ||
            style.position === "absolute" ||
            parseInt(style.zIndex, 10) > 1000;

          if (isPortalLike) {
            attachListeners(node);
            for (const descendant of Array.from(node.querySelectorAll("*"))) {
              attachListeners(descendant);
            }
            // Capture the portal appearance
            scheduleCapture("portal-open", node);
          }
        }
      }
    }
  });

  bodyObserver.observe(document.body, {
    childList: true,
  });

  return {
    stop(): RecordingData {
      stopped = true;

      // Cancel any pending capture
      if (captureTimer !== null) {
        clearTimeout(captureTimer);
        captureTimer = null;
      }

      // Disconnect observers
      subtreeObserver.disconnect();
      bodyObserver.disconnect();

      // Remove all event listeners
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.length = 0;
      managedElements.clear();

      return {
        snapshots,
        transitions,
        baselineStyles,
      };
    },
  };
}
