#!/usr/bin/env node
/**
 * Turn a captured frame into ready-to-import assets.
 *
 *   node extract-assets.mjs --bundle ./spec-menus --state 001 --out ./assets
 *
 * Exists because "use the real icon" must be one command, not a research task.
 * Every icon in a capture is already there as inline SVG; when nothing turns it
 * into an importable module, an implementer draws a lookalike instead — and a
 * hand-drawn approximation of a captured icon is the single most visible way a
 * clone stops being a clone. That happened repeatedly here before the composer
 * icons were extracted, and it will keep happening until extraction is trivial.
 *
 * Emits:
 *   <out>/icons.jsx    named React components, one per SVG, styles stripped
 *   <out>/tokens.json  every distinct colour, radius and shadow in the frame
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const { values } = parseArgs({
  options: {
    bundle: { type: 'string' },
    state: { type: 'string' },
    out: { type: 'string', default: './assets' },
    names: { type: 'string', description: 'Comma-separated names in DOM order' },
  },
});

if (!values.bundle) throw new Error('--bundle is required');

const spec = JSON.parse(readFileSync(path.join(values.bundle, 'spec.json'), 'utf8'));
const state = values.state
  ? spec.states.find((s) => s.id === values.state || s.id.startsWith(values.state) || s.id.includes(values.state))
  : spec.states[0];
if (!state) throw new Error(`No state matching ${values.state}`);

const html = readFileSync(path.join(values.bundle, state.frame), 'utf8');

/** JSX-safe attribute names, and no captured inline styles. */
const clean = (markup) => {
  let out = markup.replace(/\sstyle="[^"]*"/g, '');
  out = out.replace(/\s(class|data-spec-id|data-morph|data-subject|data-favrow|data-part)="[^"]*"/g, '');
  out = out.replace(/\s+/g, ' ').trim();
  for (const [from, to] of [
    ['fill-rule', 'fillRule'], ['clip-rule', 'clipRule'], ['stroke-width', 'strokeWidth'],
    ['stroke-linecap', 'strokeLinecap'], ['stroke-linejoin', 'strokeLinejoin'],
    ['stroke-dasharray', 'strokeDasharray'], ['clip-path', 'clipPath'],
  ]) out = out.split(from).join(to);
  return out;
};

const heads = [...html.matchAll(/<svg([^>]*)>/g)].map((m) => m[1]);
const bodies = [...html.matchAll(/<svg[^>]*>([\s\S]*?)<\/svg>/g)].map((m) => m[1]);
const given = (values.names ?? '').split(',').map((n) => n.trim()).filter(Boolean);

const componentName = (index) => {
  const raw = given[index] ?? `Icon${index}`;
  const pascal = raw.replace(/[^a-z0-9]+(.)?/gi, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase());
  return `${pascal}Icon`.replace(/IconIcon$/, 'Icon');
};

const lines = [
  '/**',
  ` * Icons extracted verbatim from ${state.id}.`,
  ' *',
  ' * Do not redraw these. Inline styles are stripped so each icon inherits size',
  ' * and colour from its context rather than being frozen at capture values;',
  ' * pass className to size it and set colour via currentColor.',
  ' */',
  '',
];

for (let index = 0; index < bodies.length; index += 1) {
  const head = heads[index];
  const viewBox = /viewBox="([^"]*)"/.exec(head)?.[1] ?? '0 0 16 16';
  const name = componentName(index);

  // The rendered box, recorded alongside the path.
  //
  // A "wrong icon" report is often a wrong BOX: the path is byte-identical and
  // the slot it is drawn into is not. A 13×9 viewBox rendered into an 8×9 slot
  // letterboxes to roughly 8×5.5 and reads as a different, squashed glyph. The
  // path alone cannot tell you that happened, so the capture's own dimensions
  // and margins travel with it.
  const attr = (key) => new RegExp(`${key}="([^"]*)"`).exec(head)?.[1] ?? null;
  const style = /style="([^"]*)"/.exec(head)?.[1] ?? '';
  const styleValue = (prop) => new RegExp(`${prop}\\s*:\\s*([^;]+)`).exec(style)?.[1]?.trim() ?? null;
  const box = [
    ['width', attr('width') ?? styleValue('width')],
    ['height', attr('height') ?? styleValue('height')],
    ['margin-left', styleValue('margin-left')],
    ['margin-right', styleValue('margin-right')],
  ].filter(([, value]) => value);

  lines.push('/**');
  lines.push(` * As captured: viewBox ${viewBox}${box.length ? `, ${box.map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}.`);
  lines.push(' *');
  lines.push(' * Size it through className. If it looks wrong, compare the rendered box');
  lines.push(' * against the line above before suspecting the path — an aspect-ratio');
  lines.push(' * mismatch between viewBox and slot squashes the glyph without changing it.');
  lines.push(' */');
  lines.push(`export const ${name} = (props) => (`);
  lines.push(`  <svg viewBox="${viewBox}" fill="currentColor" aria-hidden {...props}>${clean(bodies[index])}</svg>`);
  lines.push(');', '');
}

// Design tokens actually present in the frame, so colours are not eyeballed either.
const collect = (pattern) => [...new Set([...html.matchAll(pattern)].map((m) => m[1].trim()))];
const tokens = {
  state: state.id,
  colors: collect(/(?:background-color|color|border-[a-z]+-color|fill|stroke):\s*([^;"]+)/g)
    .filter((v) => /^(#|rgb|lch|oklch|hsl)/.test(v)).sort(),
  radii: collect(/border-radius:\s*([^;"]+)/g).sort(),
  shadows: collect(/box-shadow:\s*([^;"]+)/g).filter((v) => v !== 'none'),
  fontSizes: collect(/font-size:\s*([^;"]+)/g).sort((a, b) => parseFloat(b) - parseFloat(a)),
  fontWeights: collect(/font-weight:\s*([^;"]+)/g).sort(),
};

mkdirSync(values.out, { recursive: true });
writeFileSync(path.join(values.out, 'icons.jsx'), lines.join('\n'), 'utf8');
writeFileSync(path.join(values.out, 'tokens.json'), JSON.stringify(tokens, null, 2), 'utf8');

console.error(`state     ${state.id}`);
console.error(`icons     ${bodies.length} → ${path.join(values.out, 'icons.jsx')}`);
console.error(`          ${bodies.map((_, i) => componentName(i)).join(', ')}`);
console.error(`tokens    ${tokens.colors.length} colours, ${tokens.radii.length} radii, ${tokens.shadows.length} shadows → tokens.json`);
