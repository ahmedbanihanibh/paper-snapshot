import type { RecordingData, InteractionSnapshot } from "./interaction-recorder.js";

/**
 * Converts a CSS property name to camelCase for React style objects.
 * e.g. "background-color" -> "backgroundColor"
 */
const toCamelCase = (prop: string): string =>
  prop.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

/**
 * Attempts to convert an rgb/rgba color string to hex format.
 * Returns the original string if it cannot be parsed.
 */
const colorToHex = (value: string): string => {
  const rgbMatch = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (!rgbMatch) return value;

  const r = parseInt(rgbMatch[1], 10);
  const g = parseInt(rgbMatch[2], 10);
  const b = parseInt(rgbMatch[3], 10);
  const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;

  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

  if (a < 1) {
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex}${alphaHex}`;
  }

  return hex;
};

/**
 * Returns true if the property value looks like a color.
 */
const isColorProperty = (prop: string): boolean =>
  prop.includes("color") || prop.includes("Color");

/**
 * Format a style value for inclusion in a React style object.
 */
const formatStyleValue = (prop: string, value: string): string => {
  if (isColorProperty(prop)) {
    return JSON.stringify(colorToHex(value));
  }
  return JSON.stringify(value);
};

interface InteractionGroup {
  hookName: string;
  stateName: string;
  stylesName: string;
  enterHandler: string;
  leaveHandler: string;
  enterEvent: string;
  leaveEvent: string;
  styleDelta: Record<string, string>;
}

type TriggerCategory = "hover" | "active" | "focus" | "toggle";

const categorizeTrigger = (trigger: string): TriggerCategory | null => {
  switch (trigger) {
    case "mouseenter":
    case "mouseleave":
      return "hover";
    case "mousedown":
    case "mouseup":
      return "active";
    case "focus":
    case "blur":
    case "focusin":
    case "focusout":
      return "focus";
    case "click":
      return "toggle";
    default:
      return null;
  }
};

/**
 * Groups snapshots by interaction category and computes the aggregate style
 * delta for each group (using the "to" value from the entering trigger).
 */
const groupSnapshots = (
  snapshots: InteractionSnapshot[],
): Map<TriggerCategory, Record<string, string>> => {
  const groups = new Map<TriggerCategory, Record<string, string>>();

  for (const snapshot of snapshots) {
    const category = categorizeTrigger(snapshot.trigger);
    if (!category) continue;

    // Only use the "entering" trigger to compute the delta
    const isEntering =
      snapshot.trigger === "mouseenter" ||
      snapshot.trigger === "mousedown" ||
      snapshot.trigger === "focus" ||
      snapshot.trigger === "focusin" ||
      snapshot.trigger === "click";

    if (!isEntering) continue;

    const existing = groups.get(category) ?? {};

    for (const elementDiffs of Object.values(snapshot.styleDiffs)) {
      for (const [prop, diff] of Object.entries(elementDiffs)) {
        const camelProp = toCamelCase(prop);
        // Keep the first (most representative) change for each property
        if (!(camelProp in existing)) {
          existing[camelProp] = diff.to;
        }
      }
    }

    groups.set(category, existing);
  }

  return groups;
};

const CATEGORY_CONFIG: Record<
  TriggerCategory,
  {
    hookName: string;
    stateName: string;
    stylesName: string;
    enterHandler: string;
    leaveHandler: string;
    enterEvent: string;
    leaveEvent: string;
  }
> = {
  hover: {
    hookName: "isHovered",
    stateName: "isHovered",
    stylesName: "hoverStyles",
    enterHandler: "onMouseEnter",
    leaveHandler: "onMouseLeave",
    enterEvent: "onMouseEnter",
    leaveEvent: "onMouseLeave",
  },
  active: {
    hookName: "isActive",
    stateName: "isActive",
    stylesName: "activeStyles",
    enterHandler: "onMouseDown",
    leaveHandler: "onMouseUp",
    enterEvent: "onMouseDown",
    leaveEvent: "onMouseUp",
  },
  focus: {
    hookName: "isFocused",
    stateName: "isFocused",
    stylesName: "focusStyles",
    enterHandler: "onFocus",
    leaveHandler: "onBlur",
    enterEvent: "onFocus",
    leaveEvent: "onBlur",
  },
  toggle: {
    hookName: "isOpen",
    stateName: "isOpen",
    stylesName: "toggleStyles",
    enterHandler: "onClick",
    leaveHandler: "",
    enterEvent: "onClick",
    leaveEvent: "",
  },
};

/**
 * Generates a style object literal string from a record of camelCase
 * properties to values.
 */
const generateStyleObject = (
  name: string,
  styles: Record<string, string>,
): string => {
  const entries = Object.entries(styles);
  if (entries.length === 0) return "";

  const props = entries
    .map(([prop, value]) => `    ${prop}: ${formatStyleValue(prop, value)},`)
    .join("\n");

  return `  const ${name} = {\n${props}\n  };\n`;
};

/**
 * Generates a React component string that reproduces the recorded
 * micro-interactions (hover, active, focus, toggle) with inline styles
 * and event handlers.
 *
 * @param recordingData  The data returned by `startRecording().stop()`
 * @param baselineJsx    The baseline JSX of the element (used as the component body)
 * @returns A complete React component string
 */
export function generateInteractiveReact(
  recordingData: RecordingData,
  baselineJsx: string,
): string {
  const groups = groupSnapshots(recordingData.snapshots);

  if (groups.size === 0) {
    // No interactions detected - return baseline wrapped in a component
    return `import React from 'react';\n\nexport default function InteractiveComponent() {\n  return (\n${indent(baselineJsx, 4)}\n  );\n}\n`;
  }

  const interactionGroups: InteractionGroup[] = [];

  for (const [category, styleDelta] of groups) {
    if (Object.keys(styleDelta).length === 0) continue;
    const config = CATEGORY_CONFIG[category];
    interactionGroups.push({ ...config, styleDelta });
  }

  // Build imports
  const imports = [`import { useState } from 'react';`];

  // Build hooks
  const hooks = interactionGroups
    .map(
      (group) =>
        `  const [${group.stateName}, set${capitalize(group.stateName)}] = useState(false);`,
    )
    .join("\n");

  // Build style objects
  const styleObjects = interactionGroups
    .map((group) => generateStyleObject(group.stylesName, group.styleDelta))
    .join("\n");

  // Build transition style from recorded transitions
  let transitionStyle = "";
  const transitionValues = Object.values(recordingData.transitions);
  if (transitionValues.length > 0) {
    // Use the first non-trivial transition found
    const firstTransition = transitionValues[0];
    transitionStyle = `  const transitionStyle = { transition: ${JSON.stringify(firstTransition)} };\n`;
  }

  // Build event handlers
  const handlers: string[] = [];
  for (const group of interactionGroups) {
    if (group.enterEvent === "onClick") {
      // Toggle handler
      handlers.push(
        `    ${group.enterEvent}={() => set${capitalize(group.stateName)}(prev => !prev)}`,
      );
    } else {
      handlers.push(
        `    ${group.enterEvent}={() => set${capitalize(group.stateName)}(true)}`,
      );
      if (group.leaveEvent) {
        handlers.push(
          `    ${group.leaveEvent}={() => set${capitalize(group.stateName)}(false)}`,
        );
      }
    }
  }

  // Build conditional style spreading
  const styleSpread = interactionGroups
    .map(
      (group) => `      ...(${group.stateName} && ${group.stylesName}),`,
    )
    .join("\n");

  const transitionSpread = transitionStyle
    ? "      ...transitionStyle,\n"
    : "";

  // Compose the component
  const lines: string[] = [
    ...imports,
    "",
    "export default function InteractiveComponent() {",
    hooks,
    "",
    styleObjects,
    ...(transitionStyle ? [transitionStyle] : []),
    "  return (",
    "    <div",
    ...handlers,
    "      style={{",
    transitionSpread + styleSpread,
    "      }}",
    "    >",
    indent(baselineJsx, 6),
    "    </div>",
    "  );",
    "}",
    "",
  ];

  return lines.join("\n");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? `${pad}${line}` : line))
    .join("\n");
}
