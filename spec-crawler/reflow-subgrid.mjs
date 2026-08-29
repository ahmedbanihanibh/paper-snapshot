#!/usr/bin/env node
/**
 * Bake `grid-template-columns: subgrid` into explicit tracks in captured frames.
 *
 *   node reflow-subgrid.mjs --bundle ./spec-issues-paper
 *   node reflow-subgrid.mjs --bundle ./spec-issues-paper --tab linear.app
 *
 * WHY THIS EXISTS
 *
 * A subgrid has no columns of its own — it borrows its parent's tracks. Capturing
 * a component means serializing it *out of its layout context*, which drops those
 * tracks: every cell falls into one implicit column and the component renders as a
 * vertical stack.
 *
 * Nothing throws. The reference screenshot in shots/ still looks perfect, because
 * the browser rendered the element in place. So the frames reach Paper broken and
 * look measured. Thirteen Linear issue-row frames were imported stacked exactly
 * this way, and the PNGs beside them were all correct.
 *
 * TWO THINGS THE NAIVE FIX GETS WRONG
 *
 * 1. Line names are load-bearing. Linear places every cell by name
 *    (`grid-column-start: title`). Substituting a nameless track list resolves no
 *    placement at all and each cell auto-flows onto its own row — the same stack,
 *    now with correct column widths, which is a more convincing failure.
 *
 * 2. Gaps are inherited too. A subgrid takes the parent's `column-gap` along with
 *    its tracks. Bake the tracks without it and the cells butt together. For the
 *    Linear row that is 7 gaps x 8px = 56px, exactly the difference between the
 *    1123px of track and the row's real 1179px width.
 *
 * Tracks are read live from the page over CDP — the computed value is already in
 * absolute pixels — so this must run against the same browser and route the
 * capture came from. Pass --tracks to work offline from a known value.
 */

import { parseArgs } from 'node:util';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const { values } = parseArgs({
  options: {
    bundle: { type: 'string' },
    tab: { type: 'string', default: 'linear.app' },
    port: { type: 'string', default: '9222' },
    selector: { type: 'string', default: 'a[data-list-row="true"]' },
    tracks: { type: 'string' },
    gap: { type: 'string' },
    dryRun: { type: 'boolean', default: false },
  },
});

if (!values.bundle) throw new Error('--bundle is required');

/** Read the nearest non-subgrid grid ancestor's computed tracks from the live page. */
async function readTracksFromBrowser() {
  const list = await (await fetch(`http://127.0.0.1:${values.port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && new RegExp(values.tab).test(t.url) && !/sw\.js/.test(t.url));
  if (!target) throw new Error(`No page tab matching ${values.tab}. Is the debug browser up? (bin/spec-up.sh)`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const pending = new Map();
  let id = 0;
  ws.onmessage = (message) => {
    const parsed = JSON.parse(message.data);
    if (parsed.id && pending.has(parsed.id)) { pending.get(parsed.id)(parsed); pending.delete(parsed.id); }
  };
  const evaluate = (expression) => new Promise((resolve) => {
    const callId = ++id;
    pending.set(callId, (message) => resolve(message.result?.result?.value));
    ws.send(JSON.stringify({ id: callId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });

  const result = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(values.selector)});
    if (!el) return null;
    let node = el;
    while (node) {
      const style = getComputedStyle(node);
      if (style.display.includes('grid')
          && !style.gridTemplateColumns.startsWith('subgrid')
          && style.gridTemplateColumns !== 'none') {
        return { tracks: style.gridTemplateColumns, gap: style.columnGap };
      }
      node = node.parentElement;
    }
    return null;
  })()`);
  ws.close();

  if (!result) throw new Error(`No grid ancestor found for ${values.selector} — is the right route open?`);
  return result;
}

const source = values.tracks
  ? { tracks: values.tracks, gap: values.gap ?? 'normal' }
  : await readTracksFromBrowser();

const gap = values.gap ?? source.gap;
const gapDeclaration = gap && gap !== 'normal' ? `column-gap: ${gap}; ` : '';

console.log(`tracks  ${source.tracks}`);
console.log(`gap     ${gap}\n`);

// Matches the original `subgrid ...` and any previous rewrite of the same list,
// so the script is safe to re-run.
const escaped = source.tracks.replace(/[[\]().*+?^$|\\{}]/g, '\\$&');
const pattern = new RegExp(
  `(?:column-gap:\\s*[^;"]*;\\s*)?grid-template-columns:\\s*(?:subgrid[^;"]*|${escaped})`,
  'g',
);
const replacement = `${gapDeclaration}grid-template-columns: ${source.tracks}`;

const framesDir = path.join(values.bundle, 'frames');
let files = 0;
let rewrites = 0;

for (const name of readdirSync(framesDir).filter((f) => f.endsWith('.html'))) {
  const file = path.join(framesDir, name);
  const html = readFileSync(file, 'utf8');
  const hits = (html.match(pattern) || []).length;
  files += 1;
  if (!hits) { console.log(`  ${name.padEnd(46)} —`); continue; }
  if (!values.dryRun) writeFileSync(file, html.replace(pattern, replacement));
  rewrites += hits;
  console.log(`  ${name.padEnd(46)} ${hits} resolved`);
}

console.log(`\n${files} frames scanned, ${rewrites} subgrid declarations resolved${values.dryRun ? ' (dry run)' : ''}.`);
console.log('Re-run paper_import, then screenshot one artboard and LOOK at it.');
console.log('The shots/ PNG cannot catch this class of bug — it is rendered in place.');
