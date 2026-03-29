/**
 * React generator — converts RecordingData + baseline JSX into an
 * interactive React component with useState hooks and event handlers.
 *
 * Takes the snapshots captured by the interaction recorder and produces
 * a single-file React component that reproduces the observed interactions.
 */

import type { RecordingData, InteractionSnapshot } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert rgb(r, g, b) / rgba(r, g, b, a) to #RRGGBB / #RRGGBBAA */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgb;
  const r = parseInt(m[1]).toString(16).padStart(2, "0");
  const g = parseInt(m[2]).toString(16).padStart(2, "0");
  const b = parseInt(m[3]).toString(16).padStart(2, "0");
  if (m[4] !== undefined && parseFloat(m[4]) < 1) {
    const a = Math.round(parseFloat(m[4]) * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${r}${g}${b}${a}`.toUpperCase();
  }
  return `#${r}${g}${b}`.toUpperCase();
}

/** Convert a CSS property name to camelCase (React style key) */
function toCamelCase(prop: string): string {
  if (prop.startsWith("-webkit-"))
    return (
      "Webkit" +
      prop.slice(8).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    );
  if (prop.startsWith("-moz-"))
    return (
      "Moz" +
      prop.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    );
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Format a Record of CSS props into a React style object string */
function formatStyles(styles: Record<string, string>): string {
  const entries = Object.entries(styles).map(([prop, val]) => {
    const camel = toCamelCase(prop);
    // Convert rgb values to hex
    const hexVal = val.replace(
      /rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*[\d.]+)?\)/g,
      rgbToHex,
    );
    return `${camel}: '${hexVal}'`;
  });
  return `{ ${entries.join(", ")} }`;
}

/**
 * Create a safe JS identifier from a CSS selector path.
 * e.g. "div > button:nth-of-type(2)" → "divButtonNthOfType2"
 */
function pathToIdentifier(path: string): string {
  return path
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface TriggerGroup {
  trigger: string;
  target: string;
  /** Merged style diffs across all snapshots for this trigger+target */
  styleDiffs: Record<string, Record<string, { from: string; to: string }>>;
}

/**
 * Group snapshots by trigger+target, merging their style diffs.
 * Later snapshots for the same trigger+target overwrite earlier ones.
 */
function groupSnapshots(snapshots: InteractionSnapshot[]): TriggerGroup[] {
  const map = new Map<string, TriggerGroup>();

  for (const snap of snapshots) {
    const key = `${snap.trigger}::${snap.target}`;
    let group = map.get(key);

    if (!group) {
      group = {
        trigger: snap.trigger,
        target: snap.target,
        styleDiffs: {},
      };
      map.set(key, group);
    }

    // Merge diffs: for each affected element path, merge property changes
    for (const [path, propDiffs] of Object.entries(snap.styleDiffs)) {
      if (!group.styleDiffs[path]) {
        group.styleDiffs[path] = {};
      }
      for (const [prop, diff] of Object.entries(propDiffs)) {
        group.styleDiffs[path][prop] = diff;
      }
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Code Generation
// ---------------------------------------------------------------------------

/** Map interaction trigger to React event handler name */
function triggerToHandler(trigger: string): string {
  switch (trigger) {
    case "mouseenter":
      return "onMouseEnter";
    case "mouseleave":
      return "onMouseLeave";
    case "focus":
      return "onFocus";
    case "blur":
      return "onBlur";
    case "click":
      return "onClick";
    case "pointerdown":
      return "onPointerDown";
    case "pointerup":
      return "onPointerUp";
    default:
      return `on${trigger.charAt(0).toUpperCase()}${trigger.slice(1)}`;
  }
}

/** Map trigger pairs to a descriptive state name */
function inferStateName(trigger: string, target: string): string {
  const base = pathToIdentifier(target);
  switch (trigger) {
    case "mouseenter":
    case "mouseleave":
      return `${base}Hovered`;
    case "focus":
    case "blur":
      return `${base}Focused`;
    case "click":
      return `${base}Active`;
    case "pointerdown":
    case "pointerup":
      return `${base}Pressed`;
    default:
      return `${base}${trigger.charAt(0).toUpperCase()}${trigger.slice(1)}`;
  }
}

/**
 * Generate an interactive React component from recording data.
 *
 * @param recordingData - The captured interaction snapshots and baseline styles
 * @param baselineJsx - The static JSX string of the element (already converted)
 * @returns A complete React component string with useState hooks and event handlers
 */
export function generateInteractiveReact(
  recordingData: RecordingData,
  baselineJsx: string,
): string {
  const { snapshots, transitions } = recordingData;

  if (snapshots.length === 0) {
    // No interactions recorded — return the baseline as a plain component
    return [
      "/**",
      " * UI Snapshot — Interactive React component.",
      " * No interactions were recorded; this is a static capture.",
      " */",
      `import React from 'react';`,
      "",
      "export default function CapturedComponent() {",
      "  return (",
      baselineJsx,
      "  );",
      "}",
    ].join("\n");
  }

  const groups = groupSnapshots(snapshots);

  // Identify paired triggers (enter/leave, focus/blur, down/up)
  // and generate boolean state for each pair
  const triggerPairs: Record<string, string> = {
    mouseenter: "mouseleave",
    mouseleave: "mouseenter",
    focus: "blur",
    blur: "focus",
    pointerdown: "pointerup",
    pointerup: "pointerdown",
  };

  // Collect unique state variables needed
  const stateVars = new Map<string, { setter: string; defaultValue: string }>();
  const handlerLines: string[] = [];
  const styleOverrides: Array<{
    stateName: string;
    targetPath: string;
    styles: Record<string, string>;
  }> = [];

  // Track which targets+trigger combos we've seen to avoid duplicates
  const processedStates = new Set<string>();

  for (const group of groups) {
    const stateName = inferStateName(group.trigger, group.target);
    const stateKey = stateName;

    if (processedStates.has(stateKey)) continue;
    processedStates.add(stateKey);

    const setterName = `set${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}`;

    // Determine if this trigger activates or deactivates the state
    const isActivating = ["mouseenter", "focus", "click", "pointerdown"].includes(
      group.trigger,
    );

    if (!stateVars.has(stateName)) {
      stateVars.set(stateName, {
        setter: setterName,
        defaultValue: "false",
      });
    }

    // Generate handler: set state to true or false
    const handlerName = triggerToHandler(group.trigger);
    const targetId = pathToIdentifier(group.target);
    const fnName = `handle${targetId}${handlerName.replace("on", "")}`;
    handlerLines.push(
      `  const ${fnName} = () => ${setterName}(${isActivating});`,
    );

    // Also generate the paired handler if we have a counterpart trigger
    const pairedTrigger = triggerPairs[group.trigger];
    if (pairedTrigger) {
      const pairedHandlerName = triggerToHandler(pairedTrigger);
      const pairedFnName = `handle${targetId}${pairedHandlerName.replace("on", "")}`;
      const pairedIsActivating = !isActivating;

      // Only add if we haven't already added this handler
      const pairedKey = `${pairedFnName}`;
      if (!handlerLines.some((l) => l.includes(pairedKey))) {
        handlerLines.push(
          `  const ${pairedFnName} = () => ${setterName}(${pairedIsActivating});`,
        );
      }
    }

    // Collect the "to" styles for each path when this state is active
    for (const [path, propDiffs] of Object.entries(group.styleDiffs)) {
      const toStyles: Record<string, string> = {};
      for (const [prop, diff] of Object.entries(propDiffs)) {
        toStyles[prop] = isActivating ? diff.to : diff.from;
      }
      if (Object.keys(toStyles).length > 0) {
        styleOverrides.push({
          stateName,
          targetPath: path,
          styles: toStyles,
        });
      }
    }
  }

  // Build the useState declarations
  const stateLines: string[] = [];
  for (const [name, { setter, defaultValue }] of stateVars) {
    stateLines.push(`  const [${name}, ${setter}] = useState(${defaultValue});`);
  }

  // Build the style override objects
  const overrideLines: string[] = [];
  const overridesByPath = new Map<string, Array<{ stateName: string; styles: Record<string, string> }>>();

  for (const override of styleOverrides) {
    let list = overridesByPath.get(override.targetPath);
    if (!list) {
      list = [];
      overridesByPath.set(override.targetPath, list);
    }
    list.push({ stateName: override.stateName, styles: override.styles });
  }

  for (const [path, overrides] of overridesByPath) {
    const varName = `${pathToIdentifier(path)}DynamicStyle`;
    const conditions = overrides.map((o) => {
      return `    ...(${o.stateName} ? ${formatStyles(o.styles)} : {})`;
    });
    overrideLines.push(
      `  const ${varName} = {`,
      ...conditions.map((c) => `${c},`),
      `  };`,
    );
  }

  // Build transition style if transitions were captured
  const transitionLines: string[] = [];
  if (Object.keys(transitions).length > 0) {
    transitionLines.push("  // CSS transitions captured from the original element");
    for (const [path, value] of Object.entries(transitions)) {
      const varName = `${pathToIdentifier(path)}Transition`;
      transitionLines.push(
        `  const ${varName} = { transition: '${value}' };`,
      );
    }
  }

  // Build comment block describing the interactions
  const interactionSummary = groups
    .map(
      (g) =>
        `   *   ${g.trigger} on ${g.target} → ${Object.keys(g.styleDiffs).length} element(s) affected`,
    )
    .join("\n");

  // Assemble the full component
  const lines: string[] = [
    "/**",
    " * UI Snapshot — Interactive React component.",
    " * Recorded interactions:",
    interactionSummary,
    " *",
    " * Match the EXACT visual appearance: colors, spacing, typography, icons, layout.",
    " */",
    `import React, { useState } from 'react';`,
    "",
    "export default function CapturedComponent() {",
    "  // Interaction state",
    ...stateLines,
    "",
    "  // Event handlers",
    ...handlerLines,
    "",
  ];

  if (overrideLines.length > 0) {
    lines.push("  // Dynamic style overrides", ...overrideLines, "");
  }

  if (transitionLines.length > 0) {
    lines.push(...transitionLines, "");
  }

  lines.push(
    "  return (",
    baselineJsx,
    "  );",
    "}",
  );

  // Add a comment at the end with usage hints for the dynamic styles
  if (overridesByPath.size > 0) {
    lines.push("");
    lines.push("/*");
    lines.push(
      " * To apply the recorded interactions, spread the dynamic style objects",
    );
    lines.push(" * onto the corresponding elements and attach the event handlers.");
    lines.push(" * Dynamic style variables generated:");
    for (const [path] of overridesByPath) {
      const varName = `${pathToIdentifier(path)}DynamicStyle`;
      lines.push(` *   ${varName} → applies to "${path}"`);
    }
    lines.push(" */");
  }

  return lines.join("\n");
}
