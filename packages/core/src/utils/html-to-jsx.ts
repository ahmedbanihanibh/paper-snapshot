/**
 * HTML-to-JSX converter — transforms inline-styled HTML into React JSX.
 * Ported from old_plugin/background.js htmlToJsx.
 */

/** Convert rgb(r, g, b) to #RRGGBB */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgb;
  const r = parseInt(m[1]).toString(16).padStart(2, "0");
  const g = parseInt(m[2]).toString(16).padStart(2, "0");
  const b = parseInt(m[3]).toString(16).padStart(2, "0");
  if (m[4] !== undefined && parseFloat(m[4]) < 1) {
    const a = Math.round(parseFloat(m[4]) * 255).toString(16).padStart(2, "0");
    return `#${r}${g}${b}${a}`.toUpperCase();
  }
  return `#${r}${g}${b}`.toUpperCase();
}

/** Convert CSS property name to camelCase */
function toCamelCase(prop: string): string {
  if (prop.startsWith("-webkit-")) return "Webkit" + prop.slice(8).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  if (prop.startsWith("-moz-")) return "Moz" + prop.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Convert CSS style string to JSX style object string */
function styleToJsx(styleStr: string): string {
  const props: string[] = [];
  for (const part of styleStr.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    let val = part.slice(idx + 1).trim();
    if (!name || !val) continue;
    // Convert colors to hex
    val = val.replace(/rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*[\d.]+)?\)/g, rgbToHex);
    const camel = toCamelCase(name);
    props.push(`${camel}: '${val}'`);
  }
  return `{{ ${props.join(", ")} }}`;
}

/** Convert HTML with inline styles to React JSX with style objects */
export function htmlToJsx(html: string): string {
  let jsx = html;
  // Remove class and data-class attributes (noise for JSX)
  jsx = jsx.replace(/\s+(?:class|data-class)="[^"]*"/g, "");
  // Convert style="..." to style={{ ... }}
  jsx = jsx.replace(/style="([^"]*)"/g, (_: string, s: string) => `style={${styleToJsx(s)}}`);
  // HTML to JSX attribute conversions
  jsx = jsx.replace(/\bstroke-linejoin=/g, "strokeLinejoin=");
  jsx = jsx.replace(/\bstroke-width=/g, "strokeWidth=");
  jsx = jsx.replace(/\bfill-rule=/g, "fillRule=");
  jsx = jsx.replace(/\bclip-rule=/g, "clipRule=");
  jsx = jsx.replace(/\bdata-testid=/g, "data-testid=");
  jsx = jsx.replace(/\bfill-opacity=/g, "fillOpacity=");
  jsx = jsx.replace(/\bstroke-dasharray=/g, "strokeDasharray=");
  jsx = jsx.replace(/\bstroke-dashoffset=/g, "strokeDashoffset=");
  jsx = jsx.replace(/<hr(\s)/g, "<hr$1");
  jsx = jsx.replace(/<\/hr>/g, "");
  jsx = jsx.replace(/<hr([^/]*)(?<!\/)>/g, "<hr$1 />");
  jsx = jsx.replace(/<br>/g, "<br />");
  // Indent for readability
  jsx = "    " + jsx;
  return jsx;
}
