#!/usr/bin/env node
/**
 * Build a runnable clone from a captured bundle.
 *
 *   node build-prototype.mjs --bundle ./spec-composer \
 *     --collapsed 001 --maximized 002 --out ./prototype
 *
 * The markup is the captured frames, verbatim — never hand-authored. Matching
 * the design is the point: a hand-written approximation proves nothing about the
 * pipeline, since any mismatch could be the transcription rather than the
 * capture. Only the transition is added, taken from the recorded animation, so a
 * diff against the original measures exactly one thing.
 *
 * WHAT THIS CAN AND CANNOT DO
 * A captured frame is one state's *computed* styles, inlined. Those values freeze
 * that state's layout, so stretching the collapsed frame leaves its footer
 * clustered at the top with dead space below — nothing re-runs the app's layout
 * for a larger box. Both endpoints are therefore stacked and cross-faded while
 * the container morphs, which gives each state its true layout and a faithful
 * size/timing curve.
 *
 * That is still an approximation of technique: Linear animates `min-height` on an
 * inner node and lets real layout respond, so intermediate frames show content
 * genuinely reflowing rather than two snapshots blending. Use this to validate
 * the captured spec — geometry, duration, easing, stagger — not as the shipping
 * implementation. Faithful reproduction needs real layout rules, which is what
 * the emitted CSS/Framer output is for.
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { normalizeFrameRoot } from './src/paper.mjs';

const { values } = parseArgs({
  options: {
    bundle: { type: 'string', default: './spec-composer' },
    collapsed: { type: 'string', default: '001' },
    maximized: { type: 'string', default: '002' },
    out: { type: 'string', default: './prototype' },
  },
});

const spec = JSON.parse(readFileSync(path.join(values.bundle, 'spec.json'), 'utf8'));
const pick = (needle) => spec.states.find((state) => state.id.startsWith(needle) || state.id.includes(needle));

const collapsed = pick(values.collapsed);
const maximized = pick(values.maximized);
if (!collapsed) throw new Error(`No state matching ${values.collapsed}`);
if (!maximized) throw new Error(`No state matching ${values.maximized}`);

/** The dominant animated node of a captured state — the one carrying the motion. */
const motionOf = (state) => {
  const nodes = (state?.animation?.nodes ?? []).filter((node) => Object.keys(node.properties ?? {}).length);
  return nodes.sort((a, b) => Object.keys(b.properties).length - Object.keys(a.properties).length)[0] ?? null;
};

const motion = motionOf(maximized);
if (!motion) throw new Error('No recorded animation on the maximized state — capture it first.');

const easing = motion.fit.easing ?? 'ease';
const duration = Math.round(motion.fit.duration ?? motion.measured.durationMs);

// No derived stagger. Onset differences between a CSS property and a rect
// measurement are not delays: a rect cannot move until the driving value passes
// the natural content size, so `height` always *looks* late. Treating that as a
// delay produced a clone whose footer sat still for half the animation and then
// lurched. Only a delay the platform actually declares belongs here.
const declaredDelay = Math.max(0, Math.round(Number(motion.declared?.[0]?.timing?.delay) || 0));
const delayFor = () => declaredDelay;

const at = (key, edge) => motion.properties[key]?.[edge];
const geometry = {
  collapsedWidth: at('width', 'from') ?? at('w', 'from'),
  collapsedHeight: at('height', 'from') ?? at('h', 'from'),
  maximizedWidth: at('width', 'to') ?? at('w', 'to'),
  maximizedHeight: at('height', 'to') ?? at('h', 'to'),
};

/**
 * Every dimensional difference between the two captured endpoints.
 *
 * The frames are structurally identical — same 139 elements, same `flex-grow`.
 * Maximizing changes box constraints on a handful of them, and *all* of them
 * matter: the root carries width and min-height, but it is an inner scroll
 * container gaining `min-height`/`max-height` that pins the footer to the
 * bottom. Animate only the root and the content stays clustered at the top with
 * dead space below — geometry right, layout wrong.
 *
 * Non-dimensional diffs (caret-color, transition shorthands) are deliberately
 * ignored: they are focus and timing artefacts of when each frame was captured,
 * not part of the state change.
 */
const DIMENSIONAL = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height']);

function collectMorphs(collapsedHtml, maximizedHtml) {
  const declsOf = (html) => Array.from(html.matchAll(/style="([^"]*)"/g)).map((m) => m[1]);
  const a = declsOf(collapsedHtml);
  const b = declsOf(maximizedHtml);
  if (a.length !== b.length) throw new Error(`Frames differ structurally (${a.length} vs ${b.length} styled elements) — they are not two states of one component.`);

  const parse = (style) => Object.fromEntries(style.split(';')
    .map((decl) => decl.split(/:(.+)/))
    .filter((parts) => parts.length > 1)
    .map(([key, value]) => [key.trim(), value.trim()]));

  const morphs = [];
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    const from = parse(a[index]);
    const to = parse(b[index]);
    // Override only what this element declares a transition for. Every other
    // difference is a *consequence* of layout, not a driven property: el#0's
    // min-height changes 262→637 because the inner container grew, and forcing
    // it directly applies instantly (el#0 transitions max-width only), which is
    // exactly what made the clone's height jump on frame one.
    const animatable = new Set(
      (from['transition-property'] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    );

    const changes = [];
    const instant = [];
    for (const property of DIMENSIONAL) {
      if (to[property] == null || from[property] === to[property]) continue;
      if (animatable.has(property)) {
        changes.push({ property, from: from[property] ?? 'auto', to: to[property] });
        continue;
      }
      // Non-transitioned differences are consequences of layout. Applying them
      // instantly is safe for upper bounds and plain sizes — rendered width is
      // min(width, max-width), so a tweening max-width still drives it — but
      // never for a `min-*` floor, which would force the final size on frame
      // one. The serializer inlines a computed `width`, which the real app
      // leaves auto-derived; without this the max-width tween has no effect.
      if (!/^min-/.test(property)) instant.push({ property, from: from[property] ?? 'auto', to: to[property] });
    }
    if (changes.length || instant.length) morphs.push({ index, changes, instant, animatable: Array.from(animatable) });
  }
  return morphs;
}

const collapsedHtml = normalizeFrameRoot(readFileSync(path.join(values.bundle, collapsed.frame), 'utf8'));
const maximizedHtml = normalizeFrameRoot(readFileSync(path.join(values.bundle, maximized.frame), 'utf8'));
const morphs = collectMorphs(collapsedHtml, maximizedHtml);
if (!morphs.length) throw new Error('No dimensional differences between the two captured states.');

const morphIndex = new Map(morphs.map((morph, order) => [morph.index, order]));
let seen = -1;
const markup = collapsedHtml
  .replace(/^(\s*(?:<style\b[^>]*>[\s\S]*?<\/style>\s*)*)(<[a-z][\w-]*)/i, '$1$2 id="subject" data-state="collapsed"')
  .replace(/style="([^"]*)"/g, (match) => {
    seen += 1;
    return morphIndex.has(seen) ? `data-morph="${morphIndex.get(seen)}" ${match}` : match;
  });

const widthDelay = delayFor('w') || delayFor('width');
const heightDelay = delayFor('h') || delayFor('height');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Clone under test — ${collapsed.name}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #08090a; font-family: Inter, -apple-system, system-ui, sans-serif;
  }
  /* Captured geometry and timing. Nothing here is estimated. */
  /* Width on the root, and the single property that genuinely differs between
     the captured endpoints on the container that owns it. The frame's own
     flex rules do the rest. */
  /* No transitions are declared here on purpose.
     The captured frames already carry Linear's own, inline and exact:
       el#0  transition: max-width 0.3s cubic-bezier(0.43, 0.07, 0.59, 0.94)
       el#2  transition: min-height 0.3s cubic-bezier(...)
     Inline styles beat a stylesheet rule, so anything synthesised here is
     ignored on the elements that matter — which is why an added
     width / min-height transition on el#0 applied instantly and made the
     height jump. Only the end values change; the app's own transitions animate
     them, which is as 1:1 as this can get. */
${morphs.map((morph, order) => {
  const selector = `#subject[data-state="maximized"][data-morph="${order}"], #subject[data-state="maximized"] [data-morph="${order}"]`;
  const all = [...morph.changes, ...morph.instant];
  return `  ${selector} {\n${all.map((change) => `    ${change.property}: ${change.to} !important;`).join('\n')}\n  }`;
}).join('\n')}

  #controls {
    position: fixed; top: 16px; left: 16px; display: flex; gap: 10px; align-items: center;
    font: 12px ui-monospace, monospace; color: #8a8f98; z-index: 10;
  }
  #controls button {
    background: #1c1c1f; color: #e6e6e6; border: 1px solid #3c3d40;
    border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit;
  }
</style>
</head>
<body>
  <div id="controls">
    <button id="toggle">Toggle maximize</button>
    <span>${duration}ms · ${String(easing).slice(0, 40)} · ${morphs.length} elements morph</span>
  </div>
  ${markup}
<script>
  const subject = document.getElementById('subject');
  document.getElementById('toggle').addEventListener('click', () => {
    subject.dataset.state = subject.dataset.state === 'maximized' ? 'collapsed' : 'maximized';
  });
</script>
</body>
</html>
`;

mkdirSync(values.out, { recursive: true });
const target = path.join(values.out, 'index.html');
writeFileSync(target, page, 'utf8');

console.error(`built     ${target}`);
console.error(`geometry  ${geometry.collapsedWidth}×${geometry.collapsedHeight} → ${geometry.maximizedWidth}×${geometry.maximizedHeight}`);
console.error(`timing    ${duration}ms ${String(easing).slice(0, 50)}`);
for (const morph of morphs) console.error(`morph     el#${String(morph.index).padStart(3)}  animated: ${morph.changes.map((c) => `${c.property} ${c.from}→${c.to}`).join(', ') || 'none'}${morph.instant.length ? `  |  instant: ${morph.instant.map((c) => c.property).join(', ')}` : ''}`);
console.error(`transitions  using the captured inline transitions (none synthesised)`);
console.log(target);
