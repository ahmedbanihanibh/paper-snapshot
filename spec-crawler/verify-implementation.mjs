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
 * The comparison runs in the browser on a canvas, so there is no image
 * dependency: both PNGs are drawn to the same size and their pixels differenced.
 * Output is a percentage, a per-region breakdown, and a diff image where changed
 * pixels are highlighted.
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SpecDriver } from './src/driver.mjs';

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

  // Canvas diff, in-page: no image library, and the browser is already here.
  const result = await driver.page.evaluate(async ({ a, b }) => {
    const load = (dataUri) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUri;
    });
    const [ref, cand] = await Promise.all([load(a), load(b)]);

    // Compare at the reference's size; a size mismatch is itself a finding, so
    // it is reported rather than silently normalised away.
    const w = ref.width; const h = ref.height;
    const draw = (img) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h);
    };
    const refData = draw(ref); const candData = draw(cand);

    const diff = document.createElement('canvas');
    diff.width = w; diff.height = h;
    const dctx = diff.getContext('2d');
    const out = dctx.createImageData(w, h);

    // Thirds, so the report says *where* it differs rather than only how much.
    const bands = [0, 0, 0]; const bandCounts = [0, 0, 0];
    let changed = 0;

    for (let i = 0; i < refData.data.length; i += 4) {
      const dr = Math.abs(refData.data[i] - candData.data[i]);
      const dg = Math.abs(refData.data[i + 1] - candData.data[i + 1]);
      const db = Math.abs(refData.data[i + 2] - candData.data[i + 2]);
      const delta = (dr + dg + db) / 3;
      const pixel = i / 4;
      const band = Math.min(2, Math.floor((Math.floor(pixel / w) / h) * 3));
      bandCounts[band] += 1;

      if (delta > 12) {
        changed += 1; bands[band] += 1;
        out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 96; out.data[i + 3] = 255;
      } else {
        const grey = refData.data[i] * 0.3 + refData.data[i + 1] * 0.5 + refData.data[i + 2] * 0.2;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = grey * 0.35;
        out.data[i + 3] = 255;
      }
    }
    dctx.putImageData(out, 0, 0);

    return {
      referenceSize: { w: ref.width, h: ref.height },
      candidateSize: { w: cand.width, h: cand.height },
      changedPct: +((changed / (w * h)) * 100).toFixed(2),
      bands: bands.map((n, i) => +((n / Math.max(1, bandCounts[i])) * 100).toFixed(2)),
      diffPng: diff.toDataURL('image/png'),
    };
  }, { a: `data:image/png;base64,${reference.toString('base64')}`, b: `data:image/png;base64,${candidate.toString('base64')}` });

  writeFileSync(path.join(outDir, `${state.id}-diff.png`), Buffer.from(result.diffPng.split(',')[1], 'base64'));

  const sizeMatch = result.referenceSize.w === result.candidateSize.w && result.referenceSize.h === result.candidateSize.h;
  const threshold = Number(values.threshold);
  const pass = sizeMatch && result.changedPct <= threshold;

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
