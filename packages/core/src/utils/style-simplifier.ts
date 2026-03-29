/**
 * Style simplifier — removes redundant CSS properties and consolidates shorthands.
 * Ported from old_plugin/background.js simplifyStyles.
 */

export function simplifyStyles(html: string): string {
  // Properties to remove (they duplicate shorthand or are browser-internal)
  const redundantProps = new Set([
    "border-block-end-color", "border-block-start-color",
    "border-inline-end-color", "border-inline-start-color",
    "border-end-end-radius", "border-end-start-radius",
    "border-start-end-radius", "border-start-start-radius",
    "padding-block-end", "padding-block-start",
    "padding-inline-end", "padding-inline-start",
    "margin-block-end", "margin-block-start",
    "margin-inline-end", "margin-inline-start",
    "inline-size", "block-size",
    "caret-color", "column-rule-color", "text-emphasis-color",
    "-webkit-text-fill-color", "-webkit-text-stroke-color",
    "unicode-bidi", "-webkit-tap-highlight-color",
  ]);

  // Properties that duplicate `color` value — remove if same as color
  const colorDupes = new Set([
    "outline-color", "text-decoration-color",
  ]);

  return html.replace(/style="([^"]*)"/g, (_match: string, styleStr: string) => {
    const props: Record<string, string> = {};
    let colorVal: string | null = null;

    // Parse into map
    for (const part of styleStr.split(";")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const name = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (!name) continue;
      if (name === "color") colorVal = val;
      props[name] = val;
    }

    // Remove redundant
    for (const name of redundantProps) {
      delete props[name];
    }

    // Remove color duplicates that match `color`
    if (colorVal) {
      for (const name of colorDupes) {
        if (props[name] === colorVal) delete props[name];
      }
    }

    // Consolidate border-radius if all 4 corners are the same
    const br = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
    const brVals = br.map((p) => props[p]).filter(Boolean);
    if (brVals.length === 4 && new Set(brVals).size === 1) {
      props["border-radius"] = brVals[0];
      br.forEach((p) => delete props[p]);
    }

    // Rebuild
    const simplified = Object.entries(props)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    return `style="${simplified}"`;
  });
}
