/**
 * Shared rig for the repeatability suite.
 *
 * The suite answers one question: run the same deterministic capture script N
 * times against the same frozen page, and does the pipeline emit the same
 * evidence every time? Everything here exists to make the two halves of that
 * question separable —
 *
 *   - `runCapture` produces one run's evidence into a fresh, isolated output
 *     directory, so no run can observe, resume, or contaminate another;
 *   - `canonicalManifest` strips the provenance that is *supposed* to differ,
 *     so a failure means real instability rather than a clock reading.
 *
 * Canonicalisation deliberately reuses `stableProvenance` from src/hashes.mjs
 * rather than reimplementing a stripper. If the suite ever has to strip
 * something that module does not, it goes in LOCAL_VOLATILE below with a reason
 * — a local strip is a finding to report, not a fix.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';
import { Bundle } from '../../src/bundle.mjs';
import { captureState, pointerStateAction } from '../../src/capture.mjs';
import { SpecDriver } from '../../src/driver.mjs';
import { canonicalJson, stableProvenance } from '../../src/hashes.mjs';
import * as pageAgent from '../../src/page-agent.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** How many times each fixture is captured. Lower it to shorten a debug loop. */
export const RUNS = 10;

/** Matches the browser suite: this fixture has no fonts or images to wait on. */
export const STABILITY = { timeoutMs: 3_000, quietWindowMs: 40, pollIntervalMs: 20, consecutiveSamples: 2 };

export const VIEWPORT = { width: 900, height: 600 };

const executableCandidates = [
  process.env.SPEC_BROWSER_EXECUTABLE,
  chromium.executablePath(),
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => existsSync(candidate));

export const browserOptions = executablePath ? { headless: true, executablePath } : null;

/** Skip the whole suite rather than pass vacuously when no Chromium is reachable. */
export const SKIP = browserOptions ? false : 'no chromium binary reachable';

export const launchBrowser = () => chromium.launch(browserOptions);

export const fixtureUrl = (name) => pathToFileURL(path.join(HERE, 'fixtures', name)).href;

/**
 * Keys this suite has to strip that `stableProvenance` does not.
 *
 * Each entry must name *why* the value is legitimately run-to-run volatile.
 * An empty set is the healthy state: it means the shipped stripper already
 * describes everything the pipeline emits that cannot be reproduced.
 */
const LOCAL_VOLATILE = new Map([
  // (empty — see the report if this ever gains an entry)
]);

/** Recursively drop LOCAL_VOLATILE keys. Runs after `stableProvenance`. */
function stripLocalVolatile(value) {
  if (Array.isArray(value)) return value.map(stripLocalVolatile);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value)) {
    if (LOCAL_VOLATILE.has(key)) continue;
    result[key] = stripLocalVolatile(value[key]);
  }
  return result;
}

/**
 * The comparable form of a manifest.
 *
 * `stableProvenance` is applied to the whole document, not just the
 * `provenance` subtree: it walks recursively and drops volatile keys wherever
 * they appear, which is exactly what is needed for a manifest that carries
 * `capturedAt` at the root and a `provenance` block on every state.
 */
export function canonicalManifest(manifest) {
  return stripLocalVolatile(stableProvenance(manifest));
}

export const canonicalManifestJson = (manifest) => canonicalJson(canonicalManifest(manifest));

export const readSpec = (dir) => JSON.parse(readFileSync(path.join(dir, 'spec.json'), 'utf8'));

/** Read one artifact's bytes out of a run directory. */
export const readArtifact = (dir, relativePath) => readFileSync(path.join(dir, ...relativePath.split('/')));

/** PNG IHDR is at a fixed offset; no decoder needed and no dependency added. */
export function pngDimensions(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) throw new Error('not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * A disposable output directory. Registered on the test context so it is removed
 * even when an assertion throws — a leaked run directory would poison the
 * leak assertions of every later test.
 */
export function makeRunDir(t, prefix = 'spec-repeat-') {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Names directly under a directory, sorted; missing directory reads as empty. */
export const listing = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);

export const LEASE_ROOT = path.join(os.tmpdir(), 'spec-crawler-leases');

/**
 * The capture script, run identically every time.
 *
 * Five states in a fixed order, chosen to exercise the parts of the pipeline
 * most able to reorder or drift: a subgrid row (rewritten and restored in the
 * page), an annotated dialog with a second shot and a CSS state matrix, and a
 * CSS-only hover pair whose two frames share a DOM and differ only in paint.
 */
export async function runDeterministicCapture(browser, outDir) {
  const page = await browser.newPage({ viewport: { ...VIEWPORT } });
  try {
    await page.goto(fixtureUrl('deterministic.html'), { waitUntil: 'load' });
    await page.evaluate(pageAgent.tagElements, pageAgent.ID_ATTRIBUTE);

    const driver = new SpecDriver({ close: async () => {} }, page);
    const bundle = new Bundle(outDir, { app: 'repeatability-fixture' }, { fresh: true });
    const specIdOf = (selector) => page.$eval(selector, (element, attribute) => element.getAttribute(attribute), pageAgent.ID_ATTRIBUTE);

    const results = [];
    const capture = async (options) => {
      const result = await captureState({ driver, bundle, stability: STABILITY, ...options });
      if (!result.ok) throw new Error(`capture "${options.name}" failed: ${JSON.stringify(result)}`);
      results.push(result);
      return result;
    };

    await capture({ specId: await specIdOf('#row'), name: 'issue row rest', why: 'list row', reachedBy: 'pointer parked outside the list' });
    await capture({
      specId: await specIdOf('#panel'), name: 'details panel', kind: 'dialog', tier: 4,
      annotate: { triggerId: null, label: 'bottom/start gap 4px' },
      cssSpec: true,
    });
    await capture({ specId: await specIdOf('#css-hover'), name: 'css hover rest' });
    await capture({
      specId: await specIdOf('#css-hover'), name: 'css hover hovered',
      action: pointerStateAction('hover'),
    });
    await capture({ name: 'full page' });

    bundle.write();
    return results;
  } finally {
    await page.close();
  }
}

/** One capture of the volatile fixture, plus its control state. */
export async function runDynamicCapture(browser, outDir) {
  const page = await browser.newPage({ viewport: { ...VIEWPORT } });
  try {
    await page.goto(fixtureUrl('dynamic.html'), { waitUntil: 'load' });
    await page.evaluate(pageAgent.tagElements, pageAgent.ID_ATTRIBUTE);

    const driver = new SpecDriver({ close: async () => {} }, page);
    const bundle = new Bundle(outDir, { app: 'repeatability-dynamic' }, { fresh: true });
    const specIdOf = (selector) => page.$eval(selector, (element, attribute) => element.getAttribute(attribute), pageAgent.ID_ATTRIBUTE);

    for (const [selector, name] of [['#stable', 'control panel'], ['#volatile', 'volatile panel']]) {
      const result = await captureState({ driver, bundle, stability: STABILITY, specId: await specIdOf(selector), name });
      if (!result.ok) throw new Error(`capture "${name}" failed: ${JSON.stringify(result)}`);
    }

    bundle.write();
    return readSpec(outDir);
  } finally {
    await page.close();
  }
}

export { captureState, pointerStateAction };
