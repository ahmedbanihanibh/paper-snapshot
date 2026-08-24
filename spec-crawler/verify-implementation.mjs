#!/usr/bin/env node
/**
 * Diff an implementation against its capture.
 *
 *   node verify-implementation.mjs --bundle ./spec-menus --state 001 \
 *     --url http://localhost:5173 --selector '[data-part="folder-menu"]'
 *
 * Exists because "I matched the design" was never checkable. Every other guard
 * in this toolkit describes what to build; none of them notice when the built
 * thing does not look like the capture. A claim that cannot fail is not a claim,
 * and that is precisely the gap a hand-drawn icon or an eyeballed padding slips
 * through — the code reads fine, the contract was followed, and the result is
 * still visibly not the reference.
 *
 * The comparison uses the built-in-only PNG decoder shared by standalone and
 * Paper verification. Images stay at their intrinsic sizes: geometry mismatches
 * fail instead of being hidden by rescaling. Output remains CLI-compatible while
 * adding alpha-aware, perceptual, region, and deterministic hash evidence.
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SpecDriver } from './src/driver.mjs';
import { comparePngs } from './src/visual-diff.mjs';

const { values } = parseArgs({
  options: {
    bundle: { type: 'string' },
    state: { type: 'string' },
    url: { type: 'string' },
    selector: { type: 'string' },
    endpoint: { type: 'string', default: 'http://127.0.0.1:9222' },
    out: { type: 'string' },
    threshold: { type: 'string', default: '2' },
  },
});

if (!values.bundle || !values.url || !values.selector) {
  throw new Error('--bundle, --url and --selector are required');
}

const spec = JSON.parse(readFileSync(path.join(values.bundle, 'spec.json'), 'utf8'));
const state = values.state
  ? spec.states.find((s) => s.id === values.state || s.id.startsWith(values.state) || s.id.includes(values.state))
  : spec.states[0];
if (!state) throw new Error(`No state matching ${values.state}`);
if (!state.shot) throw new Error(`State ${state.id} has no reference screenshot`);

const reference = readFileSync(path.join(values.bundle, state.shot));
const outDir = values.out ?? path.join(values.bundle, 'verify');
mkdirSync(outDir, { recursive: true });

const driver = await SpecDriver.attach(values.endpoint);
try {
  await driver.page.goto(values.url, { waitUntil: 'networkidle' });
  await driver.settle(300, 6000);

  const handle = await driver.page.$(values.selector);
  if (!handle) throw new Error(`Selector ${values.selector} not found at ${values.url}`);
  const candidate = await handle.screenshot({ type: 'png' });
  writeFileSync(path.join(outDir, `${state.id}-candidate.png`), candidate);

  // The reusable Node-side comparator decodes each PNG at its intrinsic size.
  // A mismatch is compared on a same-coordinate union canvas and always fails;
  // the candidate is never stretched to make unlike geometry appear equal.
  const threshold = Number(values.threshold);
  const result = comparePngs(reference, candidate, { threshold });
  writeFileSync(path.join(outDir, `${state.id}-diff.png`), result.diffPng);

  const sizeMatch = result.sizeMatch;
  const pass = result.pass;

  console.error(`state       ${state.id}`);
  console.error(`reference   ${result.referenceSize.w}×${result.referenceSize.h}`);
  console.error(`candidate   ${result.candidateSize.w}×${result.candidateSize.h}${sizeMatch ? '' : '   ← SIZE MISMATCH'}`);
  console.error(`changed     ${result.changedPct}%  (threshold ${threshold}%)`);
  console.error(`by band     top ${result.bands[0]}%  middle ${result.bands[1]}%  bottom ${result.bands[2]}%`);
  console.error(`diff image  ${path.join(outDir, `${state.id}-diff.png`)}`);
  console.error(`\n${pass ? 'PASS' : 'FAIL'} — ${pass ? 'matches the capture' : 'does not match the capture'}`);

  console.log(JSON.stringify({ state: state.id, pass, ...result, diffPng: undefined }));
  if (!pass) process.exitCode = 1;
} finally {
  // Always release the CDP connection: a leaked one wedges the browser for
  // every later run, which cost two restarts while building this.
  await driver.close();
}
